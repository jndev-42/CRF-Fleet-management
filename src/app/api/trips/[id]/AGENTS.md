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
- **DELETE /api/trips/[id]:** Delete a trip (authenticated, ADMIN-only)
  - Fetches trip record to get vehicleId, checkInAt, driveFolderId, missionType
  - Silently succeeds if trip not found
  - Deletes drive folder via Google Drive if driveFolderId set (non-blocking failure)
  - In transaction: deletes Trip record, resets Vehicle status to AVAILABLE (if trip was active/checkInAt is NULL), recomputes vehicle desinfection dates if trip was completed Désinfection mission
  - Returns `{ success: true }`
  - No response body validation error cases — all errors return 500

### Desinfection Special Handling
- If deleted trip was Désinfection mission (checkInAt IS NOT NULL): queries last Désinfection trip for that vehicle, sets Vehicle.lastDesinfDate and nextDesinfMaxDate (now + 42 days); if no other Désinfection trips exist, clears both dates

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle queries and transactions
- `@/lib/drive` — `deleteDriveFolder()` function
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
