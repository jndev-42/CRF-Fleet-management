<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]/second-driver

## Purpose
Add or update second driver for a trip. Allows the primary driver or admin to assign a co-driver to an active trip.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH: update second driver; roles: trip primary driver or ADMIN |

## For AI Agents

### Working In This Directory
- **PATCH /api/trips/[id]/second-driver:** Assign or update second driver
  - Accepts updateSecondDriverSchema: secondDriverId (required, min 1 char)
  - Auth required; authorization: ADMIN or primary driver of the trip
  - Fetches trip and validates: must exist
  - Verifies secondDriverId user exists in User table; returns 404 if not found
  - Updates Trip.secondDriverId
  - Returns `{ success: true }`

### Non-obvious Details
- Primary driver authorization check: `session.user.id === trip.driverId`
- Allows updating to any valid user; no role validation for second driver

## Dependencies

### Internal
- `@/lib/db` — Trip, User queries
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
