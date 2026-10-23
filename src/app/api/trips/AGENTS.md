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
  - Accepts checkOutSchema with: vehicleId, missionType, missionName, conditionOut, cleanlinessOut, parkingOut, dsaChecked, commentsOut, secondDriverId, driveFolderId, checklistOut, dataIncorrect, correctedMileage, correctedFuel, confirmMileageDecrease
  - Verifies vehicle exists and is AVAILABLE
  - Papers guard (`isLicenseBlocked` from `@/lib/licenseGuard`) on the driver **and** the `secondDriverId`, with no role exemption (ADMIN, RESP_VEHICULE, SUPER_ADMIN included) and fail-closed (missing `User` row → 403)
  - Validates role+vehicle type permissions: managers (`canManageVehicles`) can borrow any — role exemption only, never a papers exemption —, CHVPSP only VPSP vehicles, CHVL only non-VPSP
  - Désinfection mission only allowed on VPSP vehicles
  - Fetches live Renault data if the vehicle is connected (`isConnectedInDb(vehicle.id)`); auto-detects mileage and fuel level
  - Allows driver to override with `correctedMileage`/`correctedFuel` for non-connected vehicles (sends push notification to PRESIDENT, RESP_VEHICULE and ADMIN)
  - A `correctedMileage` below the known mileage (stored or telemetry) requires `confirmMileageDecrease: true`, else 400 with `code: 'MILEAGE_DECREASE_CONFIRM_REQUIRED'` (`applyCheckoutCorrection` in `@/lib/checkout`, shared with `POST /api/qr/[token]/checkout`; baseline from `readCheckoutBaseline`, alerts from `sendCheckoutAlerts` — the « Données incorrectes » push is sent only when a value actually changes). The forms ask for confirmation and resend.
  - `secondDriverId` is checked by `secondDriverError()` (`@/lib/eligibleDrivers`): distinct from the borrower, active (no INACTIF/GUEST), holding CHVL/CHVPSP for the vehicle type — else 400. Candidates come from `GET /api/vehicles/[id]/drivers`.
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
- `@/lib/vehicle-connection` — `getRenaultVehicleData(vehicleId)` for connected vehicles
- `@/lib/push` — push notifications (lazy imported)
- `@/lib/roles` — `canManageVehicles()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
