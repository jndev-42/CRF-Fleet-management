<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]

## Purpose
Vehicle detail page (`/vehicles/{name}`) — the operational hub of the app. Displays one vehicle's identity and badges, live Renault Connect telemetry (mileage, fuel/battery) with fallback to stored values, reservations, maintenance/CT status, VPSP disinfection deadlines, free-text notes, and a paginated trip history. It hosts the check-out ("Prendre le véhicule") and check-in ("Rendre") flows, incident declaration, second-driver assignment, maintenance toggling, QR code generation, and the admin edit/delete actions — roughly twenty modals in total.

This directory also owns the **shared vehicle type and helper modules** imported across `src/components/vehicle/`, `src/lib/maintenanceUtils.ts`, `src/lib/demo/DemoDB.ts`, and the API route `api/vehicles/[id]/desinfections`.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `VehicleDetailPage` (~1090 lines) — all data fetching, permission computation, and modal orchestration. |
| `types.ts` | **Shared domain types, imported repo-wide** as `@/app/vehicles/[id]/types`: `Trip`, `Vehicle`, `MaintenanceRecord`, `DesinfectionRecord`. The canonical shape of a vehicle and a trip. |
| `utils.ts` | **Shared helpers, imported repo-wide** as `@/app/vehicles/[id]/utils`: `statusLabels`, `statusClass`, `getFuelClass(level)`, `isConnected(vin)`, `formatDate(iso)` (French `dd/MM/yyyy HH:mm`, `Europe/Paris`, h23). |

## For AI Agents

### Working In This Directory
**`types.ts` and `utils.ts` are public API of this directory.** Twenty-plus files outside it import them, including tests and `src/lib/`. Changing a field or a signature there is a cross-repo change — grep for `vehicles/[id]/types` and `vehicles/[id]/utils` before editing, and do not "clean up" the odd location by moving them without updating every consumer.

**Minimum role: any authenticated user.** Unlike sibling pages this one does not use `useSession()` — it fetches `GET /api/auth/session` manually into `userRoles` / `currentUserEmail` / `currentUserUlId` state. A 401 from the vehicle fetch redirects to `/login?callbackUrl=...`. Because roles start as `[]`, admin controls appear only after that fetch resolves; guard any new role-dependent logic accordingly.

**Borrow permission is a layered computation** (in the `AVAILABLE` branch of the actions bar) — reproduce all of it if you touch it:
- ADMIN → always allowed. CHVPSP → any vehicle. CHVL → only non-VPSP (VPSP detected by `vehicle.type.toUpperCase().includes('VPSP')`).
- Then two overrides, both bypassed by ADMIN: an active reservation held by someone else (`isReservedByOther`, reported upward by `ReservationBlock`), and `licenseBlocked` from `GET /api/me/license-check` (driving papers not validated within the grace period).
- Each denial has its own French `title` message.

**Check-in permission** is narrower: `ADMIN`, the trip's `driverEmail`, or its `secondDriverEmail`.

**Read-only DT mode** is `isDtView = searchParams.get('dtView') === 'true' || isCrossUl`, where `isCrossUl` is true when the vehicle's `ulId` differs from the user's. **The cross-UL half is a real access control**, not just a URL flag: viewing a vehicle from another Unité Locale forces read-only even without the query param. Every mutating control is wrapped in `!isDtView` (check-out, check-in, incident declaration, DSA toggle, maintenance, edit, checklist, delete). Incident *history* stays visible.

Data flow — several interlocking effects:
- `fetchVehicle` (`useCallback` on `id`) hits `/api/vehicles/{id}?t=${Date.now()}` with `cache: 'no-store'`; it is the universal refresh callback passed to modals as `onRefetch`.
- `GET /api/users?vehicleType=...` loads the second-driver datalist, filtered by vehicle type.
- `fetchAllMaintenanceRecords` **recursively pages** `/api/vehicles/{id}/maintenance?page=n` until `totalPages`, because CT/revision maths needs the full history. It only runs when `firstRegistrationDate` is set, and re-runs when `maintenanceRefreshKey` is bumped by the maintenance modals.
- Renault telemetry: `GET /api/renault/{vin}` once per VIN, guarded by `!renaultData`.
- **Self-healing effect:** if any completed trip has `renaultDataValidated === 0`, the page `PATCH`es `/api/trips/{id}/refresh-renault` and refetches when the response reports `validated`. This runs on every `vehicle` change — keep the `validated` guard or it will loop.

Fuel display: electric vehicles show `batteryLevel` directly; combustion vehicles convert `fuelQuantity` to a percentage against `vehicle.maxFuelCapacity ?? 50` litres, clamped to 100. Both fall back to the stored `fuelLevel`. Manual metric editing (`EditMetricsModal`) is offered **only when the vehicle has no VIN** — telemetry-backed vehicles must not be hand-edited — and only to ADMIN or RESPO.

VPSP disinfection card colour-codes `nextDesinfMaxDate`: red when overdue (with day count), orange within 14 days, green beyond. Non-VPSP vehicles show a simpler card when `desinfTracking` is on. The two are mutually exclusive by construction.

Trip history is client-side paginated at `TRIPS_PER_PAGE = 3`; after a deletion the page index is clamped so it cannot land past the end.

Optimistic updates with rollback are used for the DSA toggle (revert on failure + error toast). Notes save is fire-and-forget optimistic. Feedback is a local `toast` state (4 s), but `alert()` still appears in the second-driver and trip-deletion paths.

Renaming a vehicle via `EditVehicleModal` changes its URL, so the success handler routes to `/vehicles/{encodeURIComponent(newName)}` instead of refetching.

**On the ~150-line convention:** this file is far past it and is the main known offender. If you are making a substantial change here, extract data fetching into a hook (e.g. `useVehicleDetail`) and the permission computation into a helper rather than adding more inline logic. Related component-level guidance lives in `src/components/vehicle/CLAUDE.md`.

## Dependencies

### Internal
- `@/components/vehicle/` — `FuelBar`, `VehicleBadges`, `DetailCard`, `VehicleNotes`, `TripItem`, `ReservationBlock`, `ChecklistManager`, `MaintenanceCard`
- `@/components/vehicle/modals/` — `CheckOutModal`, `CheckInModal`, `EditCheckOutModal`, `DeleteConfirmationModal`, `QRCodeModal`, `EditMetricsModal`, `EditVehicleModal`, `DesinfHistoryModal`, `DesinfPreCheckinModal`, `MaintenanceHistoryModal`, `PutInMaintenanceModal`, `EditRevisionIntervalsModal`, `IncidentReportModal`, `IncidentHistoryModal`
- `@/components/PhotoViewer`, `@/components/ui/VehicleDetailSkeleton`
- `@/lib/roles` — `isAdminOrAbove`; `@/lib/renault` — `RenaultVehicleData`
- `GET|PATCH /api/vehicles/{id}`, `DELETE /api/vehicles/{id}/trips`, `GET /api/vehicles/{id}/maintenance`, `PATCH /api/vehicles/{id}/maintenance-events`
- `PATCH /api/trips/{id}/second-driver`, `PATCH /api/trips/{id}/refresh-renault`, `DELETE /api/trips/{id}`
- `GET /api/auth/session`, `GET /api/me/license-check`, `GET /api/users?vehicleType=`, `GET /api/renault/{vin}`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
