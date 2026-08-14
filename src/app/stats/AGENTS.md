<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats

## Purpose
Statistics dashboard (`/stats`) with two tabs. **Véhicules** shows KPI cards, charts (km over time, by driver, by mission type), driver and vehicle breakdowns, and a "fun factor" panel for a filtered date range. **Frais** (finance roles only) shows expense-report analytics. Both tabs support CSV and PDF export over an arbitrary date range via a background job.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `StatsPage` — role gate, filter state, `fetchStats`, export handlers, tab switching. Composes the `components/stats/*` pieces. |

## For AI Agents

### Working In This Directory
**Access gate:** the allow-list `['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'PRESIDENT', 'TRESORIER', 'SUPER_ADMIN']` is checked inline with `roles.some(...)` — this page does **not** use the `@/lib/roles` helpers. Unauthenticated → `/login`; authenticated but not allow-listed → `/`.

The **Frais tab** is separately gated by `canViewExpensesStats` = `SUPER_ADMIN | PRESIDENT | TRESORIER`. Chauffeurs and ADMIN see only the Véhicules tab. The render condition is `activeTab === 'expenses' && canViewExpensesStats`, so the gate holds even if `activeTab` is forced.

**Hard 62-day display cap.** `rangeError` blocks rendering (and short-circuits `fetchStats`) when `diffDays(dateFrom, dateTo) > 62` or the range is inverted. This is intentional: wide ranges must go through the export path, not the live query. Default range is the last 60 days. Do not raise the cap without also addressing the `/api/stats` query cost.

Data flow: one effect loads filter options (`GET /api/vehicles` and `GET /api/users?drivers=true`, in `Promise.all`); `fetchStats` is a `useCallback` over `[dateFrom, dateTo, vehicleId, driverIds, missionType, rangeError]` and re-runs only while `activeTab === 'vehicles'`. **Multiple drivers are sent as a single comma-joined `driverId` param**, not repeated params.

`ChartsSection` is imported through `next/dynamic` with `ssr: false` because Recharts touches browser APIs. Any new chart component must be loaded the same way.

**Exports are a two-step job flow, and the endpoints differ per tab.** `POST /api/stats/csv|pdf` for vehicles, `POST /api/stats/expenses/csv|pdf` for expenses; the response's `jobId` is handed to `ExportReadyModal`. Only the *expenses* variants get an explicit `downloadUrl` (`/api/stats/expenses/{type}?jobId=...`) — the vehicles variants let the modal resolve the download itself. Preserve that asymmetry.

Filter styling uses page-specific global classes (`stats-filters-bar`, `stats-date-input`, `stats-filter-hint`, `kpi-card`, `charts-grid`, `breakdown-grid`, `skel`) defined in `globals.css`, not a CSS Module. The tab buttons are inline-styled rather than using `tab-btn`.

Errors are mixed by design: fetch failures set the `error` state and render an `empty-state` card, while export failures use `alert()`.

## Dependencies

### Internal
- `@/components/stats/` — `types` (`StatsData`), `MultiSelectDropdown`, `KPICards`, `DriverBreakdown`, `VehicleBreakdown`, `FunFactor`, `ExportModal`, `ExportReadyModal`, `ExpenseStatsSection`, and `ChartsSection` (dynamic)
- `GET /api/stats?dateFrom&dateTo&vehicleId&driverId&missionType` → `{ data }`
- `GET /api/vehicles`, `GET /api/users?drivers=true` — filter options
- `POST /api/stats/csv`, `POST /api/stats/pdf`, `POST /api/stats/expenses/csv`, `POST /api/stats/expenses/pdf`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
