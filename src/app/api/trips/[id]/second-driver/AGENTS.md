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
- **UL scope:** the primary driver keeps access to their own trip; for managers, cross-UL (`isOutsideUl` from `@/lib/apiAuth`, resolved via the vehicle's `ulId`) → **404**, indistinguishable from an unknown id; a session without UL (`'default'`) is refused too; SUPER_ADMIN only escapes it.
- **Eligibility guard** (only for a newly designated second driver): must be an active driver entitled to the vehicle type (`isEligibleDriver`, `@/lib/eligibleDrivers`; vehicle type read in the trip query) → **400** otherwise. Then **papers guard** (`isLicenseBlocked`, `@/lib/licenseGuard`, fail-closed) → **403**.
- **PATCH /api/trips/[id]/second-driver:** Assign or update second driver
  - Accepts updateSecondDriverSchema: secondDriverId (required, min 1 char)
  - Auth required; authorization: ADMIN or primary driver of the trip
  - Fetches trip and validates: must exist
  - Verifies secondDriverId user exists in User table; returns 404 if not found
  - Updates Trip.secondDriverId
  - Returns `{ success: true }`

### Non-obvious Details
- Primary driver authorization check: `session.user.id === trip.driverId`
- A newly designated second driver must be an eligible driver (CHVL for a VL, CHVPSP for a VPSP, not INACTIF/GUEST); the one already in place is not re-checked

## Dependencies

### Internal
- `@/lib/db` — Trip, User queries
- `@/lib/roles` — `canManageVehicles()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
