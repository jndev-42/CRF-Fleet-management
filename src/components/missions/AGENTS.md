<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# missions

## Purpose
UI for mission reports ("comptes rendus de mission"): the multi-step submission wizard used by `src/app/missions/new/page.tsx`, and the photo/signed-report viewers used by the mission detail page `src/app/missions/[id]/page.tsx`.

## Key Files
| File | Description |
|------|-------------|
| `MissionWizard.tsx` | The wizard shell — owns `MissionFormData`, the flat `supplies` map, the signed-report file, the photo list, step index, validation, and submission. Exports the `MissionFormData` interface consumed by every step. |
| `MissionWizard.module.css` | Styles for the wizard **and all of `steps/`** — progress bar, step content, toggles, radio groups, error box, nav. |
| `MissionPhotosModal.tsx` | Lightbox-style modal listing a mission's Drive photos from `folderId`. |
| `MissionPhotosSection.tsx` | Inline (non-modal) photo grid for the same data, with per-photo download links. **Currently unreferenced** — no importer in `src/`. |
| `SignedReportLightbox.tsx` | Fullscreen viewer for the signed report at `/api/drive/photos/{driveId}`; renders an `<img>` and falls back to an `<iframe>` on the image's `onError` (i.e. when the file is a PDF). |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `steps/` | The eight wizard step panels (see `steps/AGENTS.md`) |

## For AI Agents

### Working In This Directory
**The wizard's step list is dynamic — never index steps by a hard-coded number.** `activeSteps` is built at render time and steps are dispatched by *label*, not by number:
- `Matériel` + `Oxygène` are dropped when the chosen vehicle is external (`vehicle_id?.startsWith('EXTERNAL_')`).
- `Rapport signé` only appears for `mission_type` `DPS` or `PAPS`.
- `currentStepIndex = Math.min(step, activeSteps.length)` guards against the list shrinking under the user after a back-navigation.

Adding a step means adding its label to `activeSteps`, a `validateStep` branch keyed on that label, and a `{currentStepLabel === '…' && <StepN …/>}` line.

**All step state is lifted into `MissionWizard`.** Steps are pure controlled panels receiving `data` + `onChange(patch)` (or `supplies` + `onSupplyChange`). Validation is centralized in `validateStep(s)`; the signed report is mandatory when its step is active.

**Submission order matters** (`handleSubmit`): the flat `supplies` map is expanded into `{ category, item_name, quantity_used }[]` by splitting keys on the `CATEGORY__item` convention; then the signed report uploads to Drive, then the communication photos, and only if both succeed does `POST /api/missions` run with `drive_folder_id` and `signed_report_drive_id`. An upload failure aborts before the POST so no orphan mission row is created. Both uploads go through `uploadFilesToDriveSafely` from `@/lib/imageCompression` (the signed report passes `allowPdf: true`).

Two Drive root folder IDs are hard-coded constants at the top of `MissionWizard.tsx` (`MISSION_COMM_FOLDER_ID`, `SIGNED_REPORTS_FOLDER_ID`).

**Easter egg, not a feature:** on success the `MarineApprovedOverlay` animation is shown *only* when `currentUserUlId === 'ul-paris-18'`; every other UL calls `onSuccess(id)` immediately. Keep both paths.

Both photo components proxy Drive images through `/api/drive/photos/{id}` and therefore use `<img>` with an `eslint-disable-next-line @next/next/no-img-element` comment — required, since `next/image` can't handle these proxy URLs.

## Dependencies

### Internal
- `POST /api/missions` — mission report creation
- `GET /api/drive/photos?folderId=…&flat=true` — photo listing; `GET /api/drive/photos/{id}` — image/PDF proxy
- `@/lib/mission-supplies` — `SUPPLY_CATEGORIES`, `SupplyCategory`
- `@/lib/imageCompression` — `uploadFilesToDriveSafely`
- `@/components/ui/MarineApprovedOverlay` — success animation

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
