<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/trips

## Purpose
Dedicated trip statistics query endpoint. Returns raw trip records with related vehicle and user data for a given date range. Any authenticated non-INACTIF user can call it; results are scoped to the session's active UL. This is **intentional**: every member of a UL may see that UL's trip statistics — do not restrict it to managers (`canAccessAdminPanel`).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET: fetch all trips in date range; any non-INACTIF role (`isInactive` check only) |

## For AI Agents

### Working In This Directory
- GET accepts query params: `dateFrom`, `dateTo` (required, no filtering beyond these)
- Access restricted to non-inactive users (checked via `isInactive()`); no admin-panel role is required
- Date range validation: max 62 days, dateFrom must be before dateTo (consistent with /api/stats)
- Returns empty array if user's ulId is null or 'default'
- Queries Trip + Vehicle + User tables filtered by ulId and date range
- Response shape: `{ trips: [...] }` with full trip + driver/vehicle details

### Non-obvious Details
- The only role gate is `isInactive()`, by design (all UL members see their UL's trip stats). It is **dominant**: `['INACTIF','CHVL']` is denied
- Filters by vehicle's ulId (not explicit trip field)
- Returns raw DB rows, not a deduplicated or aggregated dataset

## Dependencies

### Internal
- `@/lib/roles` — `isInactive()` function
- `@/lib/db` — Trip, Vehicle, User queries
- Trip columns: id, checkOutAt, checkInAt, driverId, secondDriverId, vehicleId, missionType, missionName, mileageOut/In, fuelOut/In, conditionOut/In, cleanlinessOut/In, parkingOut/In, dsaChecked, incident, commentsOut/In

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
