<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# QR [token] Checkin

## Purpose
Finalizes an active trip for a vehicle. Resolves QR token to vehicle, finds the active Trip (checkInAt IS NULL), authorizes the driver/second driver/admin, and atomically updates Trip + Vehicle status. Optionally validates Renault Connect data within a 5-minute window and updates desinfDate if mission type is 'Désinfection'.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST (checkin: resolve token, authorize driver/admin, update trip + vehicle, optional Renault validation) |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- Requires: `session?.user` (401), non-INACTIF (403).
- Authorization: userId must match trip.driverId OR trip.secondDriverId OR isAdminOrAbove(). Otherwise 403 with message "Vous n'êtes pas autorisé...".

**Zod Schema (checkInSchema):**
- `mileageIn` (number, min 0, optional)
- `fuelIn` (number, 0-100, optional)
- `parkingIn`, `cleanlinessIn`, `incident`, `commentsIn`, `checklistIn` (all optional strings or object)
- `conditionIn` (required string, min 1)
- `desinfResponsable`, `desinfLotNumber`, `desinfType` (optional strings)

**Business Rules:**
1. If mileageIn or fuelIn undefined and vehicle has VIN: fetch live Renault data.
2. If Renault data fetch fails, logs error but continues if data supplied.
3. If mileageIn or fuelIn still undefined after Renault attempt → 400 "Données manquantes".
4. Renault validation window: cockpit timestamp must be ≥ (checkInTime - 5 min). If within window → `renaultDataValidated = 1`, else `0`.
5. If trip.missionType === 'Désinfection' → update vehicle.lastDesinfDate = today, nextDesinfMaxDate = today + 42 days.

**DB Details:**
- Transactional (write): atomically update Trip + Vehicle.
- Trip update: checkInAt, mileageIn, fuelIn, parkingIn, conditionIn, cleanlinessIn, incident, commentsIn, checklistIn, renaultDataValidated, renaultLastCheckedAt, desinfResponsable/LotNumber/Type.
- Vehicle update: status = 'AVAILABLE', mileage, fuelLevel, parkingSpot (fallback to existing if not provided), updatedAt.

**Response Shape:**
- Success: `{ success: true, checkInAt: timestamp }` (200)
- Error: `{ error: 'message' }` (400/401/403/404/500)

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `isInactive()`, `isAdminOrAbove()`
- `@/lib/renault` — `getRenaultVehicleData(vin)`

### Tables Touched
- `Vehicle` (lookup by qrToken, status/mileage/fuel/parkingSpot update, desinfDate update if needed)
- `Trip` (fetch active, update on checkin)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
