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
- `ExportReadyModal` — shown when the file is ready (CSV or PDF), unified for both

CSV/PDF export is a single synchronous request: `POST` generates the file and returns it
directly as the response body (no job store, no polling `GET`) — this was H1 in the audit
(`docs/code-review-2026-08-11.md`): an in-memory `Map` keyed by `jobId` broke on Vercel
serverless whenever `POST` and the polling `GET` landed on different lambda instances.
The client turns the response into a `Blob` (`res.blob()` → `URL.createObjectURL`) and
triggers the download via a temporary `<a download>` click when the user confirms in
`ExportReadyModal` — revoke the object URL on modal close to avoid leaking memory.
`StatsPdfDocument.tsx` is a `@react-pdf/renderer` template — it runs client-side, no Node.js APIs.

## Size rule
Each chart type (DriverBreakdown, VehicleBreakdown, ChartsSection) stays separate.
If adding a new chart section, create a new file — don't grow `ChartsSection.tsx`.
