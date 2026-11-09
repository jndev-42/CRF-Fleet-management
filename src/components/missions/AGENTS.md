<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-09-21 -->

# missions

## Purpose
UI for mission reports ("comptes rendus de mission"): the multi-step submission wizard used by `src/app/missions/new/page.tsx` **and** by the QR scan page `src/app/qr-ul/[token]/page.tsx`, plus the photo/signed-report viewers used by the mission detail page `src/app/missions/[id]/page.tsx`.

## Key Files
| File | Description |
|------|-------------|
| `MissionWizard.tsx` | The wizard shell — owns `MissionFormData` (including the two intervention-breakdown maps), the flat `supplies` map, the signed-report file, the photo list, step index, validation, and submission. Exports the `MissionFormData` interface consumed by every step. |
| `MissionWizard.module.css` | Styles for the wizard **and all of `steps/`** — progress bar, step content, toggles, radio groups, error box, nav. |
| `MissionPhotosModal.tsx` | Lightbox-style modal listing a mission's photos from `folderId` (R2 prefix `mission-com-photos/…` ; a non-R2 reference — residual Drive id — shows no photo and makes no request). |
| `SignedReportLightbox.tsx` | Fullscreen viewer for the signed report (`mediaFileUrl` : `/api/media/file?key=` for an R2 key ; renders nothing for a non-R2 reference); renders an `<img>` and falls back to an `<iframe>` on the image's `onError` (i.e. when the file is a PDF). |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `steps/` | The wizard step panels — `Step0ULSelection` (UL/DT attachment) plus the eight original panels (see `steps/AGENTS.md`) |

## For AI Agents

### Working In This Directory
**The wizard's step list is dynamic — never index steps by a hard-coded number.** `activeSteps` is built at render time and steps are dispatched by *label*, not by number:
- `UL / DT` is first **unless the wizard is locked** (see below): it carries the report's attachment (`selected_ul_id` **xor** `selected_dt_code`) and blocks `Suivant` until one is picked.
- `Répartition interventions` sits **directly after `Général`** and only exists when `formData.victim_count >= 1` — typing a count on the Général step makes it appear, back-navigating and zeroing the count makes it disappear (the index clamp handles the shrink).
- `Matériel` + `Oxygène` are dropped when the chosen vehicle is external (`vehicle_id?.startsWith('EXTERNAL_')`).
- `Rapport signé` only appears for `mission_type` `DPS` or `PAPS`.
- `currentStepIndex = Math.min(step, activeSteps.length)` guards against the list shrinking under the user after a back-navigation.

Adding a step means adding its label to `activeSteps`, a `validateStep` branch keyed on that label, and a `{currentStepLabel === '…' && <StepN …/>}` line.

**Locked-UL mode (QR scan entry point).** Three optional props drive it: `lockedUlId`, `lockedUlName` and `submitEndpoint` (default `/api/missions`). When `lockedUlId` is set, the initial form starts with `selected_ul_id: lockedUlId`, the `UL / DT` step is **removed** from `activeSteps` entirely, and a read-only `lockedUlBanner` ("Rattaché à …") is rendered above the step content instead. Leaving the step visible would let the volunteer pick a different structure than the one scanned — which the server overwrites from the token anyway, so the choice would be a lie. `submitEndpoint` is the only other difference: the QR page posts to `/api/qr-ul/[token]/mission-report`, which has no role gate. Everything else (validation, uploads, payload shape) is shared, on purpose.

**All step state is lifted into `MissionWizard`.** Steps are pure controlled panels receiving `data` + `onChange(patch)` (or `supplies` + `onSupplyChange`). Validation is centralized in `validateStep(s)`; the signed report is mandatory when its step is active.

**Submission order matters** (`handleSubmit`): the flat `supplies` map is expanded into `{ category, item_name, quantity_used }[]` by splitting keys on the `CATEGORY__item` convention; the two breakdown maps are expanded into `{ category, quantity }[]` keeping only entries `> 0`, and are forced to `[]` when `victim_count === 0` (the API rejects a non-empty breakdown at 0). Then the signed report uploads to R2 (`type: 'mission-report-photo'`), then the communication photos (`type: 'mission-com-photos'`), and only if both succeed does `POST /api/missions` run with `drive_folder_id` (the R2 prefix) and `signed_report_drive_id` (the signed report key, `fileIds[0]`). An upload failure aborts before the POST so no orphan mission row is created. Both uploads go through `uploadMediaSafely` from `@/lib/imageCompression` (`POST /api/media/upload`, with `ulId` and `name`); a PDF is accepted for `mission-report-photo` only, decided by the server from the type.

Because the payload is built as `{ ...formData, … }`, the array forms **must** be listed after the spread — `formData` still holds the two maps under the same keys, and the server expects arrays.

**The breakdown invariant is enforced twice.** `validateStep('Répartition interventions')` blocks `Suivant` with an inline French message when either grid's sum differs from `victim_count`; the API repeats the check in a Zod `superRefine` (400). Keep both — the client check is UX, the server check is the contract.

Uploads go to R2 through `uploadMediaSafely` (`POST /api/media/upload`): photos as `type: 'mission-com-photos'`, the signed report as `type: 'mission-report-photo'`, both with `ulId: selected_ul_id` and `name: mission_name` — the server keeps the UL only if the user belongs to it (else their home UL, then their session UL) and builds the folder `{type}/{UL}/{mission}-{horodatage}-{xxxx}`. No Drive folder id is hard-coded any more.

**Easter egg, not a feature:** on success the `MarineApprovedOverlay` animation is shown *only* when `formData.selected_ul_id === 'ul-paris-18'` — the UL of the **poste chosen at step 1**, not the submitter's active UL (the `currentUserUlId` prop was removed). Every other selection calls `onSuccess(id)` immediately. Keep both paths.

Both photo components load images through `mediaListUrl` / `mediaFileUrl` (`/api/media/*` ; both return `null` for a non-R2 reference, which then shows no photo) and therefore use `<img>` with an `eslint-disable-next-line @next/next/no-img-element` comment — required, since `next/image` can't handle these proxy URLs.

## Dependencies

### Internal
- `POST /api/missions` — mission report creation (default `submitEndpoint`)
- `POST /api/qr-ul/[token]/mission-report` — creation from a scanned UL QR code (locked-UL mode)
- `GET /api/media/photos?folderId=…&flat=true` / `GET /api/media/file?key=…` (R2)
- `@/lib/mission-supplies` — `SUPPLY_CATEGORIES`, `SupplyCategory`
- `@/lib/mission-interventions` — the two category lists and their French labels (shared with the detail page)
- `@/lib/imageCompression` — `uploadMediaSafely`, `mediaFileUrl`, `mediaListUrl`
- `@/components/ui/MarineApprovedOverlay` — success animation

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
