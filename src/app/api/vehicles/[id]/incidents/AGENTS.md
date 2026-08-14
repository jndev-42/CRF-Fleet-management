<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/incidents

## Purpose
Fetches incident reports for a vehicle. Non-admins see only their own reports; admins see all. Includes incident type, status, occurrence time, and submission time. Read-only. Touches `IncidentReport` and `User` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch vehicle incidents |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/incidents** — Any authenticated user. Fetches incident reports for this vehicle. Non-admins filtered to `userId = session.user.id`; admins see all. Returns array sorted by `createdAt DESC` with fields: `id`, `vehicleId`, `userId`, `userName`, `userEmail`, `tripId`, `reservationId`, `type`, `status`, `occurredAt`, `createdAt`, `submittedAt`, `canEdit` (boolean = user is author or admin).

**Key business rules:**
- `[id]` is vehicle name; resolved internally via `SELECT id FROM Vehicle WHERE name = ?`
- `canEdit` flag: true if `userId === session.user.id` OR user is admin
- Non-admin users cannot see other users' incident reports for this vehicle
- Read-only; incident creation/update handled elsewhere

## Dependencies

### Internal
- `@/lib/db` — `IncidentReport`, `User` tables (JOIN)
- `@/lib/roles` — `isAdminOrAbove`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
