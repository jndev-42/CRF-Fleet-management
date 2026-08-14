<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/desinfections

## Purpose
Retrieves disinfection history for a vehicle. For VPSP vehicles, returns all "Désinfection" missions that are checked in. For non-VPSP vehicles with `desinfTracking=true`, returns all checked-in trips with a `desinfLotNumber`. Disabled vehicles return empty list. Read-only. Touches `Trip`, `User`, and `Vehicle` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch disinfection records |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/desinfections** — Any authenticated user. Resolves vehicle by name `[id]`. Returns `{ desinfections: [...] }`. Logic:
- **VPSP vehicles**: returns trips with `missionType = 'Désinfection'` and `checkInAt` is not null
- **Non-VPSP with desinfTracking**: returns trips with `desinfLotNumber IS NOT NULL` and checked in
- **Others**: returns empty list

Response fields per record: `id`, `checkOutAt`, `checkInAt`, `desinfResponsable`, `desinfLotNumber`, `desinfType`, `driverName`.

**Key business rules:**
- `[id]` is vehicle name, not UUID
- `desinfTracking` flag on vehicle enables tracking for non-VPSP
- Only checked-in trips included (enforces `checkInAt IS NOT NULL`)
- Ordered by `checkInAt DESC` (most recent first)
- Read-only; no POST/PATCH/DELETE

## Dependencies

### Internal
- `@/lib/db` — `Trip`, `Vehicle`, `User` tables (JOIN)
- `@/auth` — NextAuth v5 session (read-only, no role check)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
