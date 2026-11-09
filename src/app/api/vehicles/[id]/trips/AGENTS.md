<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/trips

## Purpose
Clears trip history for a vehicle. Admin only. Deletes all trips associated with the vehicle and removes their R2 photos (non-blocking). Used to reset a vehicle's history. Touches `Trip` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (ADMIN) clear all trips for vehicle |

## For AI Agents

### Working In This Directory
**DELETE /api/vehicles/[id]/trips** — ADMIN only. Deletes all trips for this vehicle. Before deletion, fetches all `driveFolderId` values and calls `deleteMediaRefIfUnshared()` for each (non-blocking via Promise.allSettled). Also updates vehicle status: if status = IN_USE, sets to AVAILABLE. Uses transaction for consistency. Returns `{ success: true }`.

**Key business rules:**
- `[id]` is vehicle UUID (not name in this route)
- Photo deletion non-blocking; failures logged but don't fail request
- Only trips whose `driveFolderId` is an R2 prefix trigger a cleanup (a residual Drive id has nothing to delete)
- Vehicle status reset: IN_USE → AVAILABLE (no change if already different)
- All trips permanently deleted; non-recoverable

## Dependencies

### Internal
- `@/lib/db` — `Trip`, `Vehicle` tables (transaction)
- `@/lib/media/server` — `deleteMediaRefIfUnshared()` for R2 cleanup
- `@/lib/roles` — `canManageVehicles`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
