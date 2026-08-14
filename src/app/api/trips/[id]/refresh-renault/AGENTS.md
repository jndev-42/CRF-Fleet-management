<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]/refresh-renault

## Purpose
Renault vehicle data refresh endpoint. Polls Renault Connect API to validate or update mileage and fuel data for completed trips with pending Renault validation. Used for connected vehicles during check-in validation phase.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH: refresh Renault vehicle data for pending validation; roles: authenticated users |

## For AI Agents

### Working In This Directory
- **PATCH /api/trips/[id]/refresh-renault:** Refresh Renault data validation
  - Auth required; any authenticated user can call
  - Fetches trip and vehicle records
  - Returns early if: trip not found, renaultDataValidated !== 0 (already validated or not applicable)
  - Throttle logic: skips re-check if last checked within 5 minutes; returns `{ status: 'throttled', validated: false, ... }`
  - Max retry window: if trip.checkInAt > 2 hours ago, auto-validates with current data and returns `{ validated: true, ... }`
  - Returns 400 if vehicle not connected (no VIN)
  - Calls `getRenaultVehicleData()` and checks if cockpit timestamp is within 5-minute window of check-in time
  - If validated: transaction updates Trip (mileageIn, fuelIn, renaultDataValidated = 1, renaultLastCheckedAt), updates Vehicle (mileage, fuelLevel), returns `{ validated: true, mileageIn, fuelIn }`
  - If not yet validated: updates renaultLastCheckedAt for throttling, returns `{ validated: false, mileageIn, fuelIn }`
  - On error: updates throttle timestamp and returns 500
  - `maxDuration: 30` (Vercel serverless function)

### Non-obvious Details
- Throttle window prevents hammering Renault API (5 minutes)
- Validation window: Renault cockpit timestamp must be within 5 minutes of check-in time to be considered "fresh"
- Auto-validation after 2 hours prevents indefinite pending state
- Always updates throttle timestamp on error to prevent retry storms
- Battery level (electric) or fuel quantity (gas) converted to 0-100 percentage

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle queries and transactions
- `@/lib/renault` — `getRenaultVehicleData()` API calls

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
