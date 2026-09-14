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
- Auth via `canViewIncident()` from `@/lib/incidentAccess` — the SAME boundary as `GET /api/incidents/[id]`. Any member of the vehicle's UL downloads a SUBMITTED report; the author keeps their own report, admins see everything, another user's DRAFT is refused. This route was historically MORE permissive than the detail route in one direction and less in another — keep them on the shared predicate, do not recode inline
- The rendered document carries NO declarant name (`IncidentPdfDocument` never renders `userName`); it is anonymous by construction, which is what allows it to be shared across the UL. Do not add author identity to the PDF without revisiting this route's access rules
- Returns 401 if not logged in, 403 out of UL scope / on another user's DRAFT / for INACTIF, 404 if not found, 500 on render/Drive error

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
- `@/lib/incidentAccess` — `canViewIncident()` (shared read boundary)
- `@/components/incident/IncidentPdfDocument` — React PDF component
- `sharp` — Image processing (logo resize)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
