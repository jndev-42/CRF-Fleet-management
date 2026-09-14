<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Single incident report retrieval and state management. GET is readable by any member of the vehicle's UL for SUBMITTED reports, with the author's identity stripped unless the caller is the author or an admin. PATCH allows owner or admin to update any field (status, details, dates). DELETE removes reports (owner or admin only). Widening READ access did not widen write access.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (retrieve) — PATCH (update fields) — DELETE (remove) |

## For AI Agents

### Working In This Directory

**GET:**
- Path param: `id` — incident report ID
- Returns incident with joined vehicle name and user name
- Auto-parses JSON fields: `flashDetails`, `accidentDetails`, `damages`, `victims`, `actions`, `context`
- Auth via `canViewIncident()` from `@/lib/incidentAccess`: caller must be in the vehicle's UL (SUPER_ADMIN excepted) and the report must be SUBMITTED — unless the caller is its author or an admin. An author keeps access to their own report even from another active UL
- `userId`, `userName` and `userEmail` are DELETED from the response unless `canRevealIncidentAuthor()` passes (author or admin). Strip at the source, never client-side
- INACTIF (and legacy GUEST) → 403
- Returns 403 when out of UL scope or on another user's DRAFT, 404 if not found, 401 if not logged in

**PATCH:** Flexible field update (not action-driven like expenses).
- Auth: Owner or admin (checked via `isAdminOrAbove` helper)
- Zod schema allows optional fields: type, status, all dates, all JSON objects, descriptions
- Dynamically builds UPDATE clause from provided fields
- Auto-JSON-serializes object fields before insert
- Sets `updatedAt` to current ISO timestamp
- Returns 403 if neither owner nor admin, 404 if report not found

**DELETE:**
- Auth: Owner or admin only
- Any status allowed (unlike expenses which restrict to draft)
- Returns 403 if neither owner nor admin, 404 if not found

**DB tables:** IncidentReport, Vehicle, User

**JSON fields:** Stored as strings in DB, auto-parsed on retrieval.

## Dependencies

### Internal
- `@/lib/db` — Turso SQL queries
- `@/lib/roles` — `isAdminOrAbove()` role check
- `@/lib/incidentAccess` — `canViewIncident()`, `canRevealIncidentAuthor()` (shared read boundary for the three incident read routes)
- `@/auth` — Session & user ID

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
