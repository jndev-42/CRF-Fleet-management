<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Missions [id]

## Purpose
Retrieves detail or deletes a specific mission report. GET enforces UL-based access control (allows SUPER admin, local admin in same UL, local manager in same UL, or the submitter). DELETE is ADMIN-only. Cascade delete of associated supplies is handled by the DB schema.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (detail with role-based access), DELETE (ADMIN only) |

## For AI Agents

### Working In This Directory

**Roles & Access:**
- GET: Access granted if: `isSuperAdmin()` OR (isAdmin AND same UL) OR (isReadOnlyManager AND same UL) OR (submitter has CI/RPAPS/CHVL/CHVPSP AND submitted this report). Otherwise 403.
- DELETE: ADMIN-only (checked via `isAdminOrAbove()`). 404 if report not found.

**Business Rules:**
- GET returns supplies grouped by category for UI rendering.
- Vehicle name/type fallback: if `vehicle_id` exists but `vehicle_name` is null, looks up in `EXTERNAL_VEHICLES` dictionary.
- DELETE checks for existence before deleting; returns 404 if not found.
- Supplies cascade-delete automatically (DB foreign key constraint with ON DELETE CASCADE).

**DB Details:**
- Fetches from `mission_reports` (LEFT JOINs User for submitter/driver, Vehicle for name/type).
- Fetches supplies from `mission_report_supplies` ordered by category, item_name.
- Grouping by category is done in-app after fetch.

**Response Shape:**
- GET: full report object with `supplies: { category: [ { id, item_name, quantity_used }, ... ], ... }` or 404.
- DELETE: `{ success: true }` (200) or 404/401/403/500.

## Dependencies

### Internal
- `db` (libSQL) — parameterized SQL
- `auth` from `@/auth` — NextAuth v5 session
- `@/lib/roles` — `isAdminOrAbove()`, `isSuperAdmin()`, `isReadOnlyManager()`
- `@/lib/mission-supplies` — `EXTERNAL_VEHICLES` lookup

### Tables Touched
- `mission_reports` (id lookup, field access for role checks, delete)
- `mission_report_supplies` (fetch all for report_id)
- `User` (submitter_by/driver_id LEFT JOINs)
- `Vehicle` (vehicle_id LEFT JOIN for name/type)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
