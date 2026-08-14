<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# QR [token] Vehicle

## Purpose
Resolves a QR token to a vehicle and returns its public data plus active trip (if any). Used by mobile/web clients to populate the checkin screen. Access control: any authenticated, non-INACTIF user (no UL or role checks; QR is the bypass).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (resolve token to vehicle + active trip) |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- Requires: `session?.user` (401), non-INACTIF (403).
- No UL or role check; any authenticated user can resolve any QR token.

**Business Rules:**
1. QR token lookup: `SELECT * FROM Vehicle WHERE qrToken = ?`.
2. If no vehicle found → 404.
3. Fetch active trip (if any): `LEFT JOIN Trip WHERE vehicleId = vehicle.id AND checkInAt IS NULL`.
4. Include trip driver/secondDriver names/emails via LEFT JOINs to User.

**DB Details:**
- Single query with LEFT JOINs: Vehicle ← Trip ← User (driver + secondDriver).
- Returns all vehicle fields + trip data (if active trip exists, else NULL for trip fields).

**Response Shape (success):**
```json
{
  "id": "uuid",
  "name": "Renault Kangoo",
  "plate": "ABC-123",
  "type": "Fourgon",
  "status": "IN_USE" or "AVAILABLE",
  "fuelLevel": 75,
  "mileage": 45000,
  "fuelType": "Essence" or "Électrique",
  "hasDSA": true,
  "desinfTracking": true,
  "parkingSpot": "Parking A",
  "vin": "VF1...",
  "maxFuelCapacity": 50,
  "maxBatteryCapacityKwh": null,
  "ulId": "ul-paris-18",
  "activeTrip": {
    "id", "vehicleId", "driverId", "secondDriverId", "driverName", "driverEmail",
    "secondDriverName", "secondDriverEmail", "missionType", "missionName",
    "checkOutAt", "mileageOut", "fuelOut", "conditionOut", "cleanlinessOut",
    "parkingOut", "dsaChecked", "commentsOut", "checklistOut", "driveFolderId",
    "checkInAt" (always null for active trip), "createdAt"
  } or null
}
```

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `isInactive()`

### Tables Touched
- `Vehicle` (lookup by qrToken, all fields)
- `Trip` (LEFT JOIN for active trip, all fields)
- `User` (LEFT JOIN × 2 for driver/secondDriver names/emails)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
