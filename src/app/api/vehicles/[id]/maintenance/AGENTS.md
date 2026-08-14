<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/maintenance

## Purpose
Historical maintenance record log for a vehicle. Allows any user to list records (paginated, 5 per page) and admins to add new records. Records track service date, type (CT, REVISION, CT_REVISION), and optional mileage. Read-heavy. Touches `VehicleMaintenanceRecord` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) paginated maintenance history; POST (ADMIN) create record |
| `[recordId]/route.ts` | DELETE (ADMIN) remove individual record |

## Subdirectories
- `[recordId]` — Delete maintenance record

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/maintenance** — Any authenticated user. Paginated: `?page=N` (default 1). Returns `{ records, total, page, totalPages }`. Each record has: `id`, `vehicleId`, `date`, `type`, `mileage` (nullable), `createdAt`. Ordered by date DESC.

**POST /api/vehicles/[id]/maintenance** — ADMIN only. Creates record with `date` (required), `type` (CT, REVISION, CT_REVISION), optional `mileage`. Validates date required, enum type. Returns `{ success: true, record }` 201.

**Key business rules:**
- Pagination: 5 records per page; page index 1-based
- `[id]` is vehicle name; resolved to UUID
- Date stored as-is; no time component (date only)
- Mileage optional; `null` if not provided
- Read-heavy route (GET no auth check, but POST admin-only)

## Dependencies

### Internal
- `@/lib/db` — `VehicleMaintenanceRecord` table
- `@/lib/roles` — `isAdminOrAbove`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
