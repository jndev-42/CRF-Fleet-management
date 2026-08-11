<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Upload

## Purpose
Upload receipt/justification files to Google Drive for an expense report. Creates automatic folder hierarchy under the shared "Note de frais" folder with timestamp-based naming. Returns folder ID for frontend to reference in expense report creation.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST — upload receipt files to Drive |

## For AI Agents

### Working In This Directory

**POST:**
- Content-Type: `multipart/form-data`
- Form fields:
  - `files` (required): Receipt files (images or PDFs)
  - `folderId` (optional): Reuse existing Drive folder ID instead of creating new
- Auth: Login check only; no role restrictions
- File validation: max 4.2 MB per file, 4.2 MB total per request; must be image or PDF
- Folder creation: `SHARED_FOLDER_ID/Note de frais/Note-de-frais-{UserName}-{Timestamp}/`
- If `folderId` provided and non-null, reuses it (skips folder creation)
- Returns: `{ success: true, folderId, fileIds }` with Drive file IDs for each uploaded receipt
- Mock mode: In preview environment, returns mock folder/file IDs (no Drive API)

**Side effects:** Creates Drive folder structure if new folder needed.

**Error handling:** File size or validation errors return 400 with French error messages. Drive API errors return 500.

## Dependencies

### Internal
- `@/lib/drive` — Google Drive API client
- `@/auth` — Login check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
