<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# QR [token] Checkout

## Purpose
Starts a new trip (checkout) for a vehicle identified by QR token. Validates vehicle is AVAILABLE, fetches live Renault data if connected, creates Trip record, and atomically updates Vehicle to IN_USE. Allows user to override mileage/fuel with corrections if `dataIncorrect = true`.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST (checkout: resolve token, create trip, update vehicle status, optional Renault fetch) |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- Requires: `session?.user` (401), non-INACTIF (403).
- No role check; any authenticated non-INACTIF user can checkout.

**Zod Schema (checkOutSchema):**
- `missionType` (required string, min 1)
- `missionName` (optional string)
- `conditionOut` (required string, min 1)
- `cleanlinessOut`, `parkingOut`, `commentsOut` (optional strings)
- `dsaChecked` (boolean, default false)
- `checklistOut` (optional object, string → boolean)
- `dataIncorrect` (optional boolean)
- `correctedMileage`, `correctedFuel` (optional numbers, for override if dataIncorrect = true)

**Business Rules:**
1. Vehicle must exist (qrToken lookup) and status must be 'AVAILABLE'. Else 404 or 400.
2. If vehicle has VIN: attempt to fetch live Renault cockpit data (mileage, fuel or battery).
3. For fuel: electric vehicles use batteryLevel; fuel vehicles use fuelQuantity / maxFuelCapacity * 100 (capped at 100).
4. If `dataIncorrect = true` and correctedMileage/correctedFuel provided: override fetched/existing values.
5. Fallback parking spot: user-supplied or vehicle.parkingSpot or null.
6. Trip is created with driverId = session.user.id, secondDriverId = null (no second driver on QR checkout).

**DB Details:**
- Transactional (write): atomically insert Trip + update Vehicle.
- Trip insert: 16 fields (id, vehicleId, driverId, secondDriverId=null, missionType, missionName, checkOutAt, mileageOut, fuelOut, conditionOut, cleanlinessOut, parkingOut, dsaChecked, commentsOut, checklistOut, createdAt).
- Vehicle update: status = 'IN_USE', mileage, fuelLevel, updatedAt.

**Response Shape:**
- Success: `{ tripId, vehicleId, driverName, driverEmail, checkOutAt, mileageOut, fuelOut }` (201)
- Error: `{ error: 'message', details? }` (400/401/403/404/500)

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `isInactive()`
- `@/lib/renault` — `getRenaultVehicleData(vin)`

### Tables Touched
- `Vehicle` (lookup by qrToken, status/mileage/fuel update)
- `Trip` (insert new trip)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
