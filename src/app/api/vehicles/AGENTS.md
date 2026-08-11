<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles

## Purpose
Manages the fleet: list all vehicles for a user's UL (or DT if DT-role user), and create new vehicles. Returns vehicles with active trip and maintenance status. Enforces UL scope: users see only their UL's vehicles (or DT's assigned ULs). Touches `Vehicle`, `Trip`, `User`, `VehicleMaintenance`, and `UniteLocale` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) list vehicles for UL or DT; POST (ADMIN) create vehicle |

## Subdirectories
- `[id]` — Individual vehicle details, status, trips
- `[id]/checklist` — Vehicle checkout/checkin checklists
- `[id]/desinfections` — Disinfection records (VPSP + tracking-enabled vehicles)
- `[id]/incidents` — Incident reports
- `[id]/maintenance` — Maintenance records (historical log)
- `[id]/maintenance-events` — Active maintenance windows
- `[id]/metrics` — Update mileage/fuel for manual (non-connected) vehicles
- `[id]/qr-token` — QR code bypass token (lazy-create or regenerate)
- `[id]/reservations` — Reservation calendar (single + recurrence)
- `[id]/trips` — Clear trip history
- `calendar` — Month/DT-scoped calendar view (reservations, trips, maintenance)

## For AI Agents

### Working In This Directory
**GET /api/vehicles** — Any authenticated user. Returns vehicles for their UL (or DT's ULs if `?view=dt`). DT role requires `dtCode` configured on UL. Optional `?vehicleType=VPSP|VL` filters by type. Response includes active trip data and active maintenance status. Users without UL get empty list.

**POST /api/vehicles** — ADMIN only. Creates vehicle with name, type, plate, and optional fields (fuel type, capacity, DSA flag, VIN, registration date, revision intervals). Validates unique name/plate (case-insensitive). Automatically assigns to user's UL if present. If `hasDSA=true`, creates DSA checkout checklist item. Returns `{ success: true, id, ... }` 201.

**Key business rules:**
- Vehicle status synced with active maintenance: if maintenance active and status ≠ IN_USE, sets to MAINTENANCE
- Trips grouped by vehicle; returns current (unchecked-in) trip if exists
- Local admins (RESPO) assigned to vehicle's UL
- UL scope: users see only their UL's vehicles; DT users see all ULs under their DT code
- DSA tracking initializes checklist for checkout flow
- Desinfection tracking activates lot-number recording in trips

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL via `@libsql/client`
- `@/lib/roles` — `isAdminOrAbove`, `hasDTRole`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
