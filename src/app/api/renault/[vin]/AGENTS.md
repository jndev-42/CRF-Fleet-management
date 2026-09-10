<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [vin]

## Purpose
GET endpoint to fetch Renault Connect telemetry data. The route parameter is the **VIN**, but it is only used to resolve the vehicle row — telemetry is then fetched by vehicle **UUID**. Returns real-time mileage, fuel, battery and cockpit metrics. Used by vehicle detail pages and cron jobs to monitor fleet.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (fetch Renault telemetry) — requires auth, takes VIN from path, resolves it to `Vehicle.id` |

## For AI Agents

### Working In This Directory
**GET** takes a VIN from the route parameter. Flow:
1. Auth check; 401 if not authenticated.
2. Call `getRenaultVehicleData(vehicle.id)` — the lib takes the vehicle **UUID**, never a VIN.
3. `VehicleNotConnectedError` ⇒ `400 { error: 'Véhicule non connecté' }`, never a 500.
3. Return the result as-is (JSON from Renault API) on success.
4. Return 500 with error message if Renault API call fails or times out.

Response shape depends on Renault API subscription and vehicle. Typically includes `totalMileage`, `fuelLevel`, `location`, `locked`, `odometer`, etc. No schema validation here; frontend should handle variant shapes.

## Dependencies

### Internal
- `@/lib/vehicle-connection` — `getRenaultVehicleData(vehicleId)`, `VehicleNotConnectedError`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
