<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# missions/[id]

## Purpose
Mission report detail view (`/missions/{id}`) — read-only display of one *compte rendu de mission*: mission info (type, date, location, victim count, Pegass registration, vehicle, driver, volunteers), a critical-incidents card (ACR / hémorragie grave / prise en charge complexe, plus follow-up flag), the signed report scan or PDF, the UL 18 team-dynamics section, and consumed supplies grouped by category. ADMIN also gets a delete action.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Client page — fetches one report, renders the cards, hosts the photos modal and signed-report lightbox. |
| `mission-detail.module.css` | **CSS Module** for header/back link, meta bar, type badges, definition lists, incident card, and supplies grid. |

## For AI Agents

### Working In This Directory
**Access gate is server-side, not client-side.** This page only checks for a session (`status === 'unauthenticated'` → push `/`); the real authorization happens in `GET /api/missions/{id}`. When that route answers **403 or 404 the page redirects to `/missions`** — both statuses are treated identically on purpose, so an unauthorized reader cannot distinguish "forbidden" from "does not exist". Preserve that behaviour if you touch `fetchReport()`.

Delete is `ADMIN`-only, checked with a bare `roles.includes('ADMIN')` (note: **not** `isAdminOrAbove`, so SUPER_ADMIN does not get the button via this check). It confirms with `confirm()`, calls `DELETE /api/missions/{id}`, and on success routes back to `/missions`; failures surface via `alert()`.

Conditional sections — do not render them unconditionally:
- Photos button + `MissionPhotosModal` only when `report.drive_folder_id` is set.
- Signed-report card + `SignedReportLightbox` only when `report.signed_report_drive_id` is set.
- Team-dynamics card only when `report.ul18_present === true` (strict — `null` and `false` both hide it).
- Supplies section only when `Object.keys(report.supplies).length > 0`.

**PDF-vs-image detection is a deliberate hack:** the signed report renders as `<img src="/api/drive/photos/{id}">` and its `onError` handler flips `signedReportIsPdf` to `true`, swapping in a `FileText` placeholder. There is no MIME check — the failed image load *is* the detection. The `<img>` carries an `@next/next/no-img-element` disable because the URL is a dynamic Drive proxy.

`boolLabel(val)` renders `null` as `—`, otherwise `Oui`/`Non`. Use it for any new tri-state field instead of a ternary.

Supplies arrive as `Record<category, SupplyEntry[]>` and are labelled via `SUPPLIES_BY_CATEGORY[cat].label`, falling back to the raw category key.

## Dependencies

### Internal
- `@/components/missions/MissionPhotosModal`, `@/components/missions/SignedReportLightbox`
- `@/lib/mission-supplies` — `SUPPLIES_BY_CATEGORY`, `MISSION_TYPE_LABELS`, `TEAM_DYNAMICS_LABELS`, `SupplyCategory`
- `GET /api/missions/{id}`, `DELETE /api/missions/{id}`
- `GET /api/drive/photos/{driveId}` — signed-report image proxy

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
