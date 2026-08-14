<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# renault

## Purpose
Renault Connect vehicle telemetry integration. Fetches real-time vehicle data (mileage, location, fuel, status) from Renault API via the `[vin]` dynamic endpoint. Requires authentication. No database writes here; used by UI and cron jobs to display/monitor telemetry data.

## Subdirectories
- `[vin]` — GET endpoint to fetch Renault telemetry for a vehicle by VIN

## For AI Agents

### Working In This Directory
Container directory for Renault telemetry queries. All endpoints require authentication. VIN is a path parameter. Responses are vendor-specific JSON from Renault API; vary by subscription and vehicle model. Treat Renault API responses as unstable; always have fallback logic if data is missing or malformed.

## Dependencies

### Internal
- `@/lib/renault` — `getRenaultVehicleData(vin)` integration
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
