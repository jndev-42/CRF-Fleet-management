<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/calendar

## Purpose
Month-scoped calendar data aggregating vehicles, reservations, trips, and maintenance for a user's UL (or DT if DT-role). Returns all four event types for calendar rendering. Single GET endpoint; read-only. Touches `Vehicle`, `Reservation`, `Trip`, `VehicleMaintenance`, `User`, and `UniteLocale` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch month's calendar data |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/calendar** — Any authenticated user. Fetches month's calendar events. Query params:
- `month=YYYY-MM` (default: current month)
- `vehicleId=UUID` (optional: filter single vehicle)
- `view=dt` (DT-role only: shows all ULs under user's DT code)

Returns `{ month, vehicles: [...], reservations: [...], trips: [...], maintenances: [...] }`. Window spans ±7 days around month (for week-padding in calendar UI).

**Vehicles** response: `{ id, name, plate, type, status, ulName }` (ordered by name).

**Reservations** response: `{ id, vehicleId, vehicleName, vehiclePlate, userEmail, userName, startTime, endTime, reason, status, createdAt }`.

**Trips** response: `{ id, vehicleId, vehicleName, vehiclePlate, driverName, secondDriverName, missionType, missionName, checkOutAt, checkInAt, isOngoing, createdAt }`.

**Maintenance** response: `{ id, vehicleId, vehicleName, vehiclePlate, startDate, endDate, reason, isEndDateUnknown, createdAt }`.

**Key business rules:**
- UL scope: users see only their UL's vehicles (or DT's assigned ULs if `view=dt`)
- DT role requires `dtCode` configured on UL; 400 if not
- Month default: current date
- Window: ±7 days from month start/end (week padding for UI)
- Trips included: `checkOutAt <= windowEnd AND (checkInAt >= windowStart OR checkInAt IS NULL)` (ongoing trips included)
- Maintenance: `startDate <= windowEnd AND (endDate >= windowStart OR endDate IS NULL)` (active and future both included)
- All ordered by start time / creation time ASC
- Read-only; no POST/PATCH/DELETE

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL across Vehicle, Reservation, Trip, VehicleMaintenance, User, UniteLocale tables
- `@/lib/roles` — `hasDTRole`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
