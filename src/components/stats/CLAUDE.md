# Stats Components

## Data flow
`stats/page.tsx` fetches data → passes typed props down. Components are **display-only** — no fetching inside stats components.
Types are in `./types.ts` — extend there when adding new stats shapes.

## Recharts — always dark-mode safe
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

## Fun Factor
`FunFactor.tsx` shows blurred messages when a driver/vehicle dominates > 50% of trips.
5 thresholds: 50 / 65 / 75 / 80 / 90%. Message is revealed on click.
Logic lives in `src/__tests__/unit/fun-factor.test.ts` — keep it tested.

## Export modals
- `ExportModal` — date range picker (type="date" only, no time), triggers CSV or PDF
- `ExportReadyModal` — shown when CSV is ready
- `PdfReadyModal` — shown when PDF job is ready (polls GET /api/stats/pdf?jobId=xxx)

PDF generation uses a job pattern: POST → get jobId → poll GET → stream buffer.
`StatsPdfDocument.tsx` is a `@react-pdf/renderer` template — it runs client-side, no Node.js APIs.

## Size rule
Each chart type (DriverBreakdown, VehicleBreakdown, ChartsSection) stays separate.
If adding a new chart section, create a new file — don't grow `ChartsSection.tsx`.
