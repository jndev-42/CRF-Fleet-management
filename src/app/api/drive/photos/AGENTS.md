<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Photos

## Purpose
List media files (images and PDFs) from a Drive folder. Supports two modes: hierarchical (subfolder-based, for trip vehicle photos with emprunt/rendu stages) and flat (direct files, for expense receipts and mission photos).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — lists photos by folder structure (hierarchical or flat mode) |

## Subdirectories
- [`[fileId]`]([fileId]/AGENTS.md) — Download a specific photo file

## For AI Agents

### Working In This Directory
**Auth:** Basic login check only; no role restrictions.

**Query parameters:**
- `folderId` (required): Drive folder ID to search
- `flat` (optional): `'true'` for flat listing, default false (hierarchical)

**Hierarchical mode (stage-based):** Expects subfolders named "emprunt" and "rendu" within the parent folder. Returns object `{ emprunt: [...], rendu: [...] }` with images from each subfolder.

**Flat mode:** Lists all images and PDFs directly in the folder (no subfolders). Returns `{ photos: [...] }` array.

**Mock data:** If `folderId` starts with `mock-`, returns mock arrays locally (no Drive API call).

**Response shape:**
- Hierarchical: `{ emprunt: [{ id, name }], rendu: [{ id, name }] }`
- Flat: `{ photos: [{ id, name, mimeType }] }`

### Database
No database writes. Read-only Drive API.

## Dependencies

### Internal
- `@/lib/drive` — Google Drive API client
- `@/auth` — Session/login check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
