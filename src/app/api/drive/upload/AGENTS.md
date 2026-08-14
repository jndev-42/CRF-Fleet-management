<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Upload

## Purpose
Upload media files to Google Drive with automatic folder structure creation. Supports two flows: vehicle-based (creates `[Vehicle]-[Date]/[stage]` folders for emprunt/rendu photos) and mission-based (creates `[Mission]-[Date]` folders for mission photos). Returns folder IDs for frontend to reference in future uploads.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST — upload files to Drive, auto-create folder hierarchy |

## For AI Agents

### Working In This Directory
**Auth:** Login check only; no role restrictions.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `files` (required, array): Files to upload
- `vehicleName` (optional): Vehicle name (required if `stage` is set)
- `stage` (optional): 'emprunt' or 'rendu' (vehicle flow)
- `date` (required): ISO date string for folder naming
- `missionName` (optional): Mission name (required if `stage` is absent)
- `existingFolderId` (optional): Reuse existing Drive folder instead of creating new
- `rootFolderId` (optional): Custom root folder (defaults to SHARED_FOLDER_ID)
- `allowPdf` (optional): `'true'` to allow PDF uploads (images always allowed)

**Validation:**
- Vehicle flow: requires `vehicleName` + `date` + `stage`
- Mission flow: requires `missionName` + `date` (no stage)
- File size: max 4.2 MB per file, 4.2 MB total per request
- MIME types: images (any), optional PDFs

**Folder creation:**
- Vehicle flow: `SHARED_FOLDER_ID/[VehicleName]-[Date]/[stage]/`
- Mission flow: `rootFolderId/[MissionName]-[Date]/`
- Preview mode: all uploads under `SHARED_FOLDER_ID/PREVIEW/`

**Response:** `{ success: true, folderId, subfolderId, fileIds }`

**Mock mode:** If preview env, returns mock folder/file IDs (no Drive API call).

### Database
No database writes. Returns Drive folder IDs for frontend to store if needed.

## Dependencies

### Internal
- `@/lib/drive` — Google Drive API client
- `@/auth` — Session check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
