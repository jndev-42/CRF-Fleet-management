<!-- Parent: ../../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/maintenance/[recordId]

## Purpose
Delete individual maintenance records. ADMIN only. Verifies record belongs to the specified vehicle before deletion. Touches `VehicleMaintenanceRecord` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (ADMIN) remove maintenance record |

## For AI Agents

### Working In This Directory
**DELETE /api/vehicles/[id]/maintenance/[recordId]** — ADMIN only. Deletes record if it belongs to this vehicle. Resolves `[id]` (vehicle name) to UUID, then verifies `[recordId]` belongs to that vehicle. Returns `{ success: true }` or 404 if record not found or belongs to different vehicle.

**Key business rules:**
- Both `[id]` (vehicle name) and `[recordId]` must match in database
- No cascading effects; safe to delete old records
- 404 if vehicle not found or record does not belong to vehicle

## Dependencies

### Internal
- `@/lib/db` — `VehicleMaintenanceRecord` table
- `@/lib/roles` — `isAdminOrAbove`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
