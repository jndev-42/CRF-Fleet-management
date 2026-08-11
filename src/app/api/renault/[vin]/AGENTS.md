<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [vin]

## Purpose
GET endpoint to fetch Renault Connect telemetry data for a vehicle by VIN. Returns real-time mileage, fuel, location, status, and other metrics from Renault API. Used by vehicle detail pages and cron jobs to monitor fleet. No database reads or writes; pure pass-through from Renault service.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (fetch Renault telemetry) — requires auth, takes VIN from path |

## For AI Agents

### Working In This Directory
**GET** takes a VIN from the route parameter. Flow:
1. Auth check; 401 if not authenticated.
2. Call `getRenaultVehicleData(vin)`.
3. Return the result as-is (JSON from Renault API) on success.
4. Return 500 with error message if Renault API call fails or times out.

Response shape depends on Renault API subscription and vehicle. Typically includes `totalMileage`, `fuelLevel`, `location`, `locked`, `odometer`, etc. No schema validation here; frontend should handle variant shapes.

## Dependencies

### Internal
- `@/lib/renault` — `getRenaultVehicleData(vin)`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
