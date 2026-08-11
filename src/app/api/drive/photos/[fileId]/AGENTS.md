<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [fileId]

## Purpose
Secure proxy to stream/download a specific file from Google Drive. Fetches MIME type and name from Drive metadata, then streams the file bytes with appropriate `Content-Type` and `Content-Disposition` headers. Acts as an authentication boundary — only logged-in users can access Drive files.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — stream file from Drive (images, PDFs) |

## For AI Agents

### Working In This Directory
**Auth:** Login check only; no role restrictions.

**Path parameter:** `fileId` — Drive file ID to download.

**Mock files:** If `fileId` starts with `mock-`, returns mock PNG or PDF (base64-encoded) without Drive API call.

**Response:** 
- Streams file bytes with `Content-Type` header from Drive metadata
- Sets `Content-Disposition: inline` for browser preview
- Returns 401 if not logged in, 500 on Drive API error

**Error handling:** Drive API errors (network, quota, not found) return 500 with generic message `"Failed to load image"` (no stack trace).

### Database
No database interaction.

## Dependencies

### Internal
- `@/lib/drive` — File fetch from Drive API
- `@/auth` — Session check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
