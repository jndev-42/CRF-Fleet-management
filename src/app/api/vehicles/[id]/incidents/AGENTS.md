<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/incidents

## Purpose
Fetches incident reports for a vehicle, scoped to the caller's UL. Every member of the UL sees all SUBMITTED reports plus their own drafts; admins see every report. The author's identity is stripped server-side unless the caller is the author or an admin. Read-only. Touches `IncidentReport`, `Vehicle` and `User` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch vehicle incidents |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/incidents** — Any authenticated, non-INACTIF user of the vehicle's UL. Non-admins are filtered to `(status = 'SUBMITTED' OR userId = session.user.id)`; admins see all. Returns array sorted by `createdAt DESC` with fields: `id`, `vehicleId`, `tripId`, `reservationId`, `type`, `status`, `occurredAt`, `createdAt`, `submittedAt`, `isOwn` (boolean), `canEdit` (boolean = author or admin), plus `userId`, `userName`, `userEmail` **only when the caller may see the author**.

**Key business rules:**
- `[id]` is vehicle name; resolved via `SELECT id, ulId FROM Vehicle WHERE name = ?`, then bounded to the caller's UL. Vehicle names are unique only WITHIN a UL — a vehicle of another UL returns 404 (not 403: confirming the homonym's existence adds nothing)
- Authorization goes through `@/lib/incidentAccess` — never recode the predicates inline; the three incident read routes must not diverge
- Author identity is stripped AT THE SOURCE (keys absent from the JSON), never hidden client-side
- Another user's DRAFT is never returned to a non-admin — an unfinished declaration is not circulated
- INACTIF (and legacy GUEST) → 403
- Read-only; incident creation/update handled elsewhere

## Dependencies

### Internal
- `@/lib/db` — `IncidentReport`, `Vehicle`, `User` tables (JOIN)
- `@/lib/roles` — `isAdminOrAbove`
- `@/lib/incidentAccess` — `isWithinUlScope`, `isIncidentAuthor`, `canRevealIncidentAuthor`, `isIncidentViewerBlocked`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
