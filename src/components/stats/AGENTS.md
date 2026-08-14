<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats

## Purpose
Display-only statistics components — charts, KPI cards, CSV/PDF export flows for trip and expense stats.

## Key Files
| File | Description |
|------|-------------|
| `ChartsSection.tsx` | Chart section container — one file per chart type, don't grow this file |
| `DriverBreakdown.tsx` / `VehicleBreakdown.tsx` | Per-driver / per-vehicle chart breakdowns |
| `KPICards.tsx` | Top-level KPI tiles |
| `FunFactor.tsx` | Blurred "dominance" message when a driver/vehicle exceeds a share-of-trips threshold |
| `ExportModal.tsx` | Date-range picker (date only, no time), triggers CSV or PDF export |
| `ExportReadyModal.tsx` | Shown when CSV export is ready |
| `PdfReadyModal.tsx` | Shown when PDF export job is ready (polls `GET /api/stats/pdf?jobId=xxx`) |
| `StatsPdfDocument.tsx` / `ExpenseStatsPdfDocument.tsx` | `@react-pdf/renderer` templates — run client-side, no Node.js APIs |
| `ExpenseStatsSection.tsx` | Expense stats display section |
| `MultiSelectDropdown.tsx` | Generic multi-select filter control |
| `types.ts` | Stats prop/data shape types — extend here for new stats shapes |

## For AI Agents

### Working In This Directory
This directory has its own actively-maintained `CLAUDE.md` — treat it as authoritative; the guidance below mirrors it.

### Data flow
`stats/page.tsx` fetches data → passes typed props down. Components are **display-only** — no fetching inside stats components. Types are in `./types.ts` — extend there when adding new stats shapes.

### Recharts — always dark-mode safe
Use CSS variables inside chart style props, never hardcoded colors:
```tsx
<XAxis stroke="var(--text-secondary)" />
<Tooltip contentStyle={{
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
}} />
<Bar fill="var(--crf-red)" />
```
Always wrap charts in `<ResponsiveContainer width="100%" height={300}>`.

### Fun Factor
`FunFactor.tsx` shows blurred messages when a driver/vehicle dominates > 50% of trips. 5 thresholds: 50 / 65 / 75 / 80 / 90%. Message is revealed on click. Logic lives in `src/__tests__/unit/fun-factor.test.ts` — keep it tested.

### Export modals
`ExportModal` → CSV or PDF trigger. `ExportReadyModal` → CSV ready. `PdfReadyModal` → PDF job pattern: POST → get jobId → poll GET → stream buffer.

### Size rule
Each chart type stays in its own file. If adding a new chart section, create a new file — don't grow `ChartsSection.tsx`.

## Dependencies

### Internal
- `src/app/api/stats/*`, `src/app/api/stats/expenses/*`

### External
- `recharts`, `@react-pdf/renderer`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
