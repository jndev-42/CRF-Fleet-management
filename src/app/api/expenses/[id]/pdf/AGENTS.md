<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# PDF

## Purpose
Generate PDF export of an expense report. Assembles all report data, signatures, validator info, unit logo/stamp, and renders via `@react-pdf/renderer` into a downloadable PDF file with all details formatted for printing/archival.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — generate and stream PDF for expense report |

## For AI Agents

### Working In This Directory

**GET:**
- Path param: `id` — expense report ID
- Returns PDF file (attachment) with filename `note-de-frais-{id}.pdf`
- Fetches full report from DB including unit logo/stamp image from UniteLocale table
- Embeds CRF logo (`public/logo_crf_text.png`) resized to 480x130px as base64 data URI
- Renders React PDF component with all report fields, signatures, validator metadata
- Returns 401 if not logged in, 404 if report not found, 500 on render error

**PDF rendering:**
- Uses `@react-pdf/renderer` with custom `ExpensePdfDocument` component
- Includes: report ID, amounts, items, user/validator signatures, unit info, imputation, timestamps
- All images embedded as base64 data URIs (no external CDN)

**DB tables:** ExpenseReport, User, UniteLocale

**Dependencies:** `sharp` (image processing for logo resizing), `@react-pdf/renderer`

## Dependencies

### Internal
- `@/lib/db` — Fetch report with full metadata
- `@/auth` — Login check
- `@/components/expenses/ExpensePdfDocument` — React PDF component
- `sharp` — Image processing (resize logo)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
