<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/csv

## Purpose
Trip data CSV export endpoint using two-step job pattern. POST generates a CSV buffer and returns jobId; GET retrieves the file by jobId. Includes trip details, driver info, mileage, fuel, condition, and incident data.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST: generate CSV job (returns jobId); GET: download CSV by jobId. Roles: active users (not INACTIF) |

## For AI Agents

### Working In This Directory
- **POST:** Accepts `{ dateFrom, dateTo }` query params, validates date range (max 62 days), queries Trip + Vehicle + User tables, generates CSV buffer, stores in global `__csvJobs` Map with UUID jobId, returns `{ jobId, status: 'ready' }`
- **GET:** Accepts `jobId` query param, validates UUID format, retrieves buffer from global job map, streams as `text/csv` attachment with BOM, cleans up jobs older than 10 minutes
- Roles: not INACTIF (uses `isInactive()` check)
- Query columns: checkOutAt, checkInAt, driver name/email, second driver name/email, vehicle name/plate, mission type/name, mileage, fuel, condition, cleanliness, parking, DSA checked, incident, comments
- CSV escapes: handles commas, quotes, newlines in cell values
- Headers: French language

### Non-obvious Details
- In-memory job storage using global variable — jobs expire after 10 minutes
- CSV encoding includes BOM (`﻿`) for Excel compatibility
- Only stores date portion of trip check-out time for filtering

## Dependencies

### Internal
- `@/lib/db` — Trip, Vehicle, User queries
- Trip table columns: checkOutAt, checkInAt, driverId, secondDriverId, vehicleId, missionType, missionName, mileageOut/In, fuelOut/In, condition/cleanliness/parking (out/in), dsaChecked, incident, comments

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
