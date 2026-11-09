<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]

## Purpose
Container for individual trip operations by trip ID. Supports deletion, checkin/checkout edits, desinfection pre-data, and Renault data refresh.

## Subdirectories
- `checkin/` — Check-in vehicle (return) endpoint
- `checkout/` — Edit checkout details (active trip only) endpoint
- `desinf-pre/` — Pre-checkin desinfection data endpoint
- `refresh-renault/` — Refresh Renault vehicle data endpoint
- `second-driver/` — Add/update second driver endpoint

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE: remove trip and cleanup drive folder; roles: ADMIN only |

## For AI Agents

### Working In This Directory
- **UL scope (DELETE):** cross-UL (`isOutsideUl` from `@/lib/apiAuth`, resolved via the vehicle's `ulId`) → **404**, indistinguishable from an unknown id; a session without UL (`'default'`) is refused too; SUPER_ADMIN only escapes it. Nothing is deleted.
- **DELETE /api/trips/[id]:** Delete a trip (authenticated, ADMIN-only)
  - Fetches trip record to get vehicleId, checkInAt, driveFolderId, missionType
  - Silently succeeds if trip not found
  - Deletes the R2 photos if driveFolderId is an R2 prefix not shared with another record (non-blocking failure ; a residual Drive id has nothing to delete)
  - In transaction: deletes Trip record, resets Vehicle status to AVAILABLE (if trip was active/checkInAt is NULL), recomputes vehicle desinfection dates if trip was completed Désinfection mission
  - Returns `{ success: true }`
  - No response body validation error cases — all errors return 500

### Desinfection Special Handling
- If deleted trip was Désinfection mission (checkInAt IS NOT NULL): queries last Désinfection trip for that vehicle, sets Vehicle.lastDesinfDate and nextDesinfMaxDate (last desinf + vehicle.desinfIntervalMonths months, default 3); if no other Désinfection trips exist, clears both dates

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle queries and transactions
- `@/lib/media/server` — `deleteMediaRefIfUnshared()`
- `@/lib/roles` — `canManageVehicles()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
