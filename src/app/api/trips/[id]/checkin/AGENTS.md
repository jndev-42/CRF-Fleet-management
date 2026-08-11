<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]/checkin

## Purpose
Vehicle check-in (return) endpoint. Completes an active trip by recording mileage, fuel, condition, and optional incident/desinfection data. Transitions vehicle status back to AVAILABLE.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH: check-in vehicle (return); roles: trip driver, second driver, or ADMIN |

## For AI Agents

### Working In This Directory
- **PATCH /api/trips/[id]/checkin:** Check-in vehicle
  - Accepts checkInSchema: mileageIn, fuelIn, parkingIn, conditionIn, cleanlinessIn, incident, commentsIn, parkingPhoto, driveFolderId, checklistIn, desinfResponsable, desinfLotNumber, desinfType
  - Auth required; authorization: only first driver, second driver, or ADMIN can check in
  - Fetches trip and vehicle records
  - Validates: trip must exist and not already checked in (checkInAt IS NULL)
  - If vehicle is connected (has VIN): fetches live Renault data, auto-fills mileageIn/fuelIn if not provided
  - Computes Renault data validation status: if cockpit timestamp is within 5-minute window of check-in time, marks as validated; otherwise pending
  - **Desinfection validation:** if trip.missionType === 'Désinfection', requires desinfResponsable and desinfLotNumber
  - **Desinfection tracking:** if vehicle has desinfTracking enabled and is not VPSP, requires desinfLotNumber and desinfType
  - Transaction: updates Trip (checkInAt, mileage/fuel, condition/cleanliness, incident, comments, parking photo, checklists, Renault validation status, desinfection fields), updates Vehicle status to AVAILABLE and parking spot, updates Vehicle.lastDesinfDate and nextDesinfMaxDate if Désinfection mission
  - Sends push notification if incident reported or condition problematic (non-blocking, after commit)
  - Returns updated Trip object with vehicle details
  - `maxDuration: 30` (Vercel serverless function 30-second timeout)

### Non-obvious Details
- Renault data validation window is 5 minutes; pending validation auto-confirms after 2 hours
- If mileageIn or fuelIn undefined and vehicle not connected, returns 400 error
- driveFolderId can be updated during checkin (overrides checkout value if provided)
- Desinfection tracking fields stored separately from mission type

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle queries and transactions
- `@/lib/renault` — `getRenaultVehicleData()` for connected vehicles
- `@/lib/onesignal` — push notifications (lazy imported)
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
