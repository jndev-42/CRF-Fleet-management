<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/pdf

## Purpose
Trip statistics PDF export endpoint using two-step job pattern. POST generates PDF with stats and incidents; GET downloads by jobId.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST: generate PDF job; GET: download PDF by jobId. Roles: active users (not INACTIF) |

## For AI Agents

### Working In This Directory
- **POST:** Accepts `{ dateFrom, dateTo }` body, validates Zod schema, calls `generatePdf()` helper, stores buffer in global `__pdfJobs` Map with UUID jobId, returns `{ success: true, jobId, status: 'ready' }`
- **GET:** Accepts `jobId` query param, retrieves buffer from global map, streams as `application/pdf` attachment, cleans up jobs older than 10 minutes
- Roles: not INACTIF (checks `roles.length === 0 || (roles[0] === 'INACTIF')`)
- `generatePdf()` helper: fetches trip stats via `fetchStatsData()`, queries incidents where `incident IS NOT NULL`, converts SVG logo to PNG via sharp, renders StatsPdfDocument React component, returns buffer
- Timestamp: French locale formatting (day/month/year HH:mm)
- Logo: public/crf-logo.svg converted to 96x96 PNG and embedded as data:image/png;base64
- Incident data shape: checkOutAt, driverName, vehicleName, incident fields

## Dependencies

### Internal
- `@/lib/stats` — `fetchStatsData()` function
- `@/lib/db` — incident query (Trip + User + Vehicle tables)
- `@react-pdf/renderer` — PDF rendering
- `sharp` — SVG to PNG conversion
- `@/components/stats/StatsPdfDocument` — React PDF component
- public/crf-logo.svg — logo file

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
