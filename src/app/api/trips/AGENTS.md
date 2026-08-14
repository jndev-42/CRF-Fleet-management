<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips

## Purpose
Container directory for trip (vehicle checkout/checkin) lifecycle management. Provides endpoints to create trips (checkout), manage active trips, check-in vehicles, and handle special operations (desinfection, Renault data refresh, second driver assignment).

## Subdirectories
- `[id]/` — Individual trip operations by trip ID

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST: create trip (vehicle checkout); roles: based on vehicle type (CHVL, CHVPSP, ADMIN) |

## For AI Agents

### Working In This Directory
- **POST /api/trips:** Create a new trip (checkout)
  - Accepts checkOutSchema with: vehicleId, missionType, missionName, conditionOut, cleanlinessOut, parkingOut, dsaChecked, commentsOut, secondDriverId, driveFolderId, checklistOut, dataIncorrect, correctedMileage, correctedFuel
  - Verifies vehicle exists and is AVAILABLE
  - Validates role+vehicle type permissions: ADMIN can borrow any, CHVPSP only VPSP vehicles, CHVL only non-VPSP
  - Désinfection mission only allowed on VPSP vehicles
  - Fetches live Renault data if vehicle has VIN; auto-detects mileage and fuel level
  - Allows driver to override with `correctedMileage`/`correctedFuel` for non-connected vehicles (sends push notification to RESPO)
  - Creates Trip record, updates Vehicle status to IN_USE, auto-deletes active reservation if user is taking reserved vehicle
  - Sends push notifications for incident conditions or data discrepancies
  - Returns 201 with Trip object including updated Vehicle details
- No authentication required path (but auth checked inside handler)
- Transaction: creates Trip, updates Vehicle status, optionally deletes Reservation

### Non-obvious Details
- Renault data fetch is wrapped in try-catch (non-blocking if API fails)
- Vehicle status validation happens before role check
- Uses `crypto.randomUUID()` for tripId

## Dependencies

### Internal
- `@/lib/db` — Vehicle, Trip, Reservation tables
- `@/lib/renault` — `getRenaultVehicleData()` for connected vehicles
- `@/lib/onesignal` — push notifications (lazy imported)
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
