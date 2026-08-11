<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats

## Purpose
Container directory for statistics and export endpoints. Provides aggregated data on trips, expenses, and related metrics for reporting and analysis. Supports filtered queries by date range, vehicle, driver, and mission type. Handles CSV and PDF export jobs.

## Subdirectories
- `csv/` — CSV export endpoint for trip data
- `expenses/` — Expense report statistics and exports
- `pdf/` — PDF export endpoint for trip stats
- `trips/` — Dedicated trip statistics query

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET: fetch aggregated trip stats; roles: active users only (not INACTIF) |

## For AI Agents

### Working In This Directory
- Parent GET route fetches stats data via `fetchStatsData()` lib function, with optional filters: vehicleId, driverId, missionType
- Date range validation: max 62 days, dateFrom must be before dateTo
- Access requires active role (not INACTIF/GUEST)
- Returns `{ success: true, data: ... }` or `{ success: false, error: '...' }`
- Subdirectories export stats as CSV/PDF via two-step job pattern: POST → jobId → GET with jobId to download

## Dependencies

### Internal
- `@/lib/stats` — `fetchStatsData()` function
- `@/lib/roles` — `isInactive()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
