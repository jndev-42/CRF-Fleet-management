<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/expenses/pdf

## Purpose
Expense report PDF export endpoint using two-step job pattern. POST generates PDF via react-pdf; GET downloads by jobId.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST: generate expense PDF job; GET: download PDF by jobId. Roles: SUPER_ADMIN, PRESIDENT, TRESORIER |

## For AI Agents

### Working In This Directory
- **POST:** Accepts `{ dateFrom, dateTo }` body, validates date range (min 1 char each), calls `generateExpensePdf()` helper, stores buffer in global `__expensePdfJobs` Map, returns `{ success: true, jobId, status: 'ready' }`
- **GET:** Accepts `jobId` query param, retrieves buffer from global map, streams as `application/pdf` attachment, cleans up jobs older than 10 minutes
- Roles: SUPER_ADMIN, PRESIDENT, or TRESORIER only
- `generateExpensePdf()` helper: fetches expense data via `fetchExpenseStatsData()`, queries UniteLocale name, converts SVG logo to PNG via sharp, renders React PDF component (ExpenseStatsPdfDocument), returns buffer
- Timestamp: French locale formatting (day/month/year HH:mm)
- Logo: public/crf-logo.svg converted to 96x96 PNG and embedded as data:image/png;base64

## Dependencies

### Internal
- `@/lib/stats` — `fetchExpenseStatsData()` function
- `@/lib/db` — UniteLocale query
- `@react-pdf/renderer` — PDF rendering
- `sharp` — SVG to PNG conversion
- `@/components/stats/ExpenseStatsPdfDocument` — React PDF component
- public/crf-logo.svg — logo file

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
