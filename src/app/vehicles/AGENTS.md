<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles

## Purpose
Fleet overview (`/vehicles`) — the app's main landing surface for drivers. Shows four KPI stat cards (total / disponibles / en mission / maintenance), the reservation calendar, a status filter bar, and a grid of vehicle cards with plate, type, status badge, current driver when in use, DSA and fuel-type flags, mileage, parking spot, and a fuel/battery gauge that prefers **live Renault Connect telemetry** over the stored manual value. Admins can add a vehicle; DT-role users can switch to a read-only cross-UL "Vision DT".

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `VehiclesPage` — vehicle fetch + per-vehicle Renault fetch, UL/DT view toggle, stats, filters, card grid, add-vehicle modal. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `[id]/` | Vehicle detail page, plus the shared `types.ts` / `utils.ts` imported across `components/vehicle/` (see `[id]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
**Minimum role: any authenticated user** — unauthenticated users are pushed to `/login` and the page returns `null`. Two capability gates:
- `isAdmin` (`isAdminOrAbove`) → "Ajouter un véhicule" button, hidden while in DT view.
- `canAccessDtView` = `hasDTRole(userRoles) && Boolean(activeUL?.dtCode)` → the UL/DT toggle. **Both conditions matter:** a DT-role user whose active UL has no `dtCode` gets no toggle.

**DT view is read-only by contract.** `isDtView` changes the fetch to `/api/vehicles?view=dt`, shows a purple advisory banner, adds a `UL {ulName}` badge to each card, appends `?dtView=true` to the detail links, and suppresses the add button. If you add a mutating control here, gate it on `!isDtView`.

Data flow: `fetchVehicles(dtMode)` fetches with `cache: 'no-store'` **and** a `t=${Date.now()}` cache-buster — vehicle status must never be stale. It then fires a parallel `GET /api/renault/{vin}` per vehicle that has a VIN, merging each result into `renaultData` keyed by **`vehicle.name`, not id**. Individual Renault failures are logged and skipped; the page still renders with stored values.

The refetch effect depends on `[status, session, isDtView, activeUL?.id]`, so switching the active UL via `ULContext` reloads the fleet.

The fuel gauge has two branches: with live Renault data it shows battery `%` for electric or litres for combustion (fill percentage assumes a **50 L tank**, `Math.min(val/50*100, 100)`) plus an autonomy line; without it, it falls back to the stored `fuelLevel` percentage. `getFuelClass` thresholds are 50 (`full`) / 25 (`mid`) / below (`low`).

**Detail links use `vehicle.name`, not `vehicle.id`** (`/vehicles/{name}`) — the detail route resolves either, but keep the name form consistent with the rest of the app.

Note the duplication: `statusLabels`, `statusClass`, and `getFuelClass` are re-declared locally here even though identical exports exist in `./[id]/utils.ts`. If you touch either copy, consider consolidating on the `[id]/utils` export that `components/vehicle/` already imports.

`data-tour` attributes (`stats`, `filters`, `vehicle-card`, `fuel-bar`) drive the onboarding tour — the `fuel-bar` marker is attached only to the first filtered card. Don't drop them when refactoring the markup.

## Dependencies

### Internal
- `@/components/vehicle/modals/AddVehicleModal`, `@/components/vehicle/VehicleCalendar`
- `@/components/ui/Skeleton` — `DashboardSkeletons`
- `@/lib/contexts/ULContext` — `useUL` (`activeUL.name`, `activeUL.dtCode`)
- `@/lib/roles` — `isAdminOrAbove`, `hasDTRole`
- `@/lib/renault` — `RenaultVehicleData` type
- `GET /api/vehicles` (+ `?view=dt`), `GET /api/renault/{vin}`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
