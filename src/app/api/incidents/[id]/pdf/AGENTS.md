<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# PDF

## Purpose
Generate PDF export of an incident report. Assembles incident data including vehicle/user info, all JSON detail fields (parsed), photos fetched from Drive folder hierarchy, and renders via `@react-pdf/renderer` into a downloadable PDF.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — generate and stream PDF for incident report |

## For AI Agents

### Working In This Directory

**GET:**
- Path param: `id` — incident report ID
- Returns PDF file (attachment) with filename `incident-report-{id}.pdf`
- Fetches full incident from DB including vehicle name/plate and user metadata
- Auto-parses all JSON fields from DB strings
- Formats `occurredAt` ISO timestamp to French date format: "DD/MM/YYYY à HH:MM"
- Fetches photos from Drive if `driveFolderId` set:
  - Supports both direct images and legacy subfolder structure (looks for 'incident-*' subfolders)
  - Embeds all photos as base64 data URIs in PDF
  - Gracefully skips missing images (non-fatal)
- Embeds CRF logo resized to 96x96px as base64 data URI
- Renders React PDF component with all report fields, vehicle, user, timestamp
- Returns 401 if not logged in, 500 on render/Drive error

**PDF rendering:**
- Uses `@react-pdf/renderer` with custom `IncidentPdfDocument` component
- Includes: incident type, occurrence date, location, damages, victims, actions, context, vehicle/user info
- All images embedded as base64 (no external CDN)
- Generated timestamp formatted: French locale with date and time

**DB tables:** IncidentReport, Vehicle, User

**Drive integration:** Optional; gracefully handles missing folder or images.

**Dependencies:** `sharp` (logo resize), `@react-pdf/renderer`, Google Drive API

## Dependencies

### Internal
- `@/lib/db` — Fetch incident with full metadata
- `@/lib/drive` — Fetch photos from Drive folder
- `@/auth` — Login check
- `@/components/incident/IncidentPdfDocument` — React PDF component
- `sharp` — Image processing (logo resize)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
