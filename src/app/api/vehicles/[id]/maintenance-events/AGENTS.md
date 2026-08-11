<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/maintenance-events

## Purpose
Manages active maintenance windows for a vehicle. Admins create events with start/end dates and reason (e.g., "CT passed", "Engine overhaul"). Supports future-dated maintenance without immediately changing vehicle status. Admins can end all active maintenance for a vehicle via PATCH. Touches `VehicleMaintenance` and `Vehicle` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST (ADMIN) create maintenance event; PATCH (ADMIN) end all active maintenance |

## For AI Agents

### Working In This Directory
**POST /api/vehicles/[id]/maintenance-events** — ADMIN only. Creates maintenance event with `startDate` (required), `endDate` (optional), `reason` (required). Dates can be ISO (with time) or YYYY-MM-DD (auto-padded to start of day/end of day). If start is today or past, immediately sets vehicle status to MAINTENANCE. Future start dates defer status change. Returns `{ success: true, maintenance: { id, vehicleId, startDate, endDate, reason } }` 201.

**PATCH /api/vehicles/[id]/maintenance-events** — ADMIN only. Ends all active maintenance records for this vehicle. Sets `endDate` to 1 second ago (timestamp precision); sets vehicle status to AVAILABLE. Returns `{ success: true, endDate }`.

**Key business rules:**
- `[id]` is vehicle name; resolved via `SELECT id FROM Vehicle WHERE name = ? OR id = ? OR name = ?`
- Start/end dates normalized: YYYY-MM-DD → ISO; ISO kept as-is
- `endDate` null = ongoing maintenance
- Vehicle status synced: if start ≤ now and status ≠ IN_USE, set MAINTENANCE
- PATCH `endDate` uses timestamp 1 second ago to mark "just ended"
- Non-blocking operations only; no complex state transitions

## Dependencies

### Internal
- `@/lib/db` — `VehicleMaintenance`, `Vehicle` tables
- `@/lib/roles` — `isAdminOrAbove`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
