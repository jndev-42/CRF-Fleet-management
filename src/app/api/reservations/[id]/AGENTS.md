<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Reservations [id]

## Purpose
Manages an individual reservation: delete, edit fields (time/reason/driver), or validate (PATCH/PUT). PATCH detects intent by checking for edit fields vs. action param: if edit fields present or action === 'update', applies edits; otherwise treats as validation request. Enforces ownership/role-based access and time-overlap conflict detection.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (owner or manager), PATCH/PUT (update/validate: role-based, conflict check, auto-PENDING on date change) |

## For AI Agents

### Working In This Directory

**Roles & Access:**
- DELETE: owner (userEmail === session.user.email) OR `canAccessAdminPanel()` OR `RESPO`. Otherwise 403.
- PATCH (edit): same as DELETE.
- PATCH (validate): manager only (`canAccessAdminPanel()` OR `RESPO`), else 403. 409 if already validated.

**Zod Schema (updateReservationSchema):**
- `startTime`, `endTime` (optional, ISO datetime)
- `reason` (optional, max 500 chars, nullable)
- `onBehalfOfUserId` (optional, UUID or special strings: 'SELF', 'UNASSIGNED')
- `isUnassignedDriver` (optional boolean)
- `action` (optional enum: 'validate' or 'update')

**PATCH Logic (dual-mode):**
1. **Edit mode** (triggered if: startTime || endTime || reason || onBehalfOfUserId || isUnassignedDriver || action === 'update'):
   - Ownership/role check required (owner or manager).
   - Validate endTime > startTime.
   - Check conflict with PENDING/VALIDATED (not only VALIDATED).
   - If driver changed (onBehalfOfUserId/isUnassignedDriver):
     - Only manager can change driver → 403 if not manager and trying to change.
     - 'UNASSIGNED' → set userName/userEmail to ('Chauffeur non décidé', session.user.email).
     - 'SELF' → set to (session.user.name, session.user.email).
     - UUID → fetch User, set to (targetUser.name, targetUser.email), 404 if not found.
   - If dates changed (startTime/endTime differ from stored): auto-revert to PENDING (needs re-validation).
   - Otherwise preserve status.

2. **Validation mode** (triggered if empty body or action === 'validate', no edit fields):
   - Manager only (403 if not).
   - Check reservation not already VALIDATED (409 if so).
   - Check conflict with VALIDATED reservations only.
   - Update status → VALIDATED.
   - Insert Notification for reservation owner (fetch vehicle name, format date range in fr-FR timezone).

**DB Details:**
- UPDATE Reservation SET startTime, endTime, reason, userName, userEmail, status WHERE id = ?.
- SELECT for conflict check uses parameterized dates.
- SELECT Vehicle for notification context.
- SELECT User for onBehalfOfUserId resolution.
- INSERT Notification if validation succeeds.

**Response Shape:**
- DELETE: `{ success: true }` (200)
- PATCH (edit): `{ success: true, status }` (200) — returns new status (PENDING if dates changed, else preserved)
- PATCH (validate): `{ success: true }` (200)
- Errors: 400/401/403/404/409/500

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `canAccessAdminPanel()`

### Tables Touched
- `Reservation` (lookup, update, conflict check)
- `User` (resolve onBehalfOfUserId, lookup for owner notifications)
- `Vehicle` (fetch name for notification)
- `Notification` (insert on successful validation)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
