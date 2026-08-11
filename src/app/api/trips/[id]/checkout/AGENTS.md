<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]/checkout

## Purpose
Edit checkout details endpoint. Allows admin to modify checkout data (drivers, mileage, fuel, condition, etc.) for an active trip.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH: edit checkout details for active trip; roles: ADMIN only |

## For AI Agents

### Working In This Directory
- **PATCH /api/trips/[id]/checkout:** Edit checkout data
  - Accepts editCheckOutSchema: driverId (required), secondDriverId, missionType, missionName, mileageOut, fuelOut, parkingOut, conditionOut, cleanlinessOut, commentsOut, dsaChecked
  - Auth required; authorization: ADMIN only
  - Fetches trip and validates: must exist, must be active (checkInAt IS NULL)
  - Verifies driverId and secondDriverId users exist in User table
  - Transaction: updates Trip fields (driverId, secondDriverId, missionType, missionName, mileageOut, fuelOut, parkingOut, conditionOut, cleanlinessOut, commentsOut, dsaChecked), updates Vehicle mileage/fuelLevel/updatedAt while IN_USE
  - Returns updated Trip object with driver names and email

### Non-obvious Details
- Only ADMIN can modify checkout details; driver cannot edit their own trip
- Validates both drivers exist before updating
- Updates Vehicle.mileage/fuelLevel to match submitted mileageOut/fuelOut

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle, User queries and transactions
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
