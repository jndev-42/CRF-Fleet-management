<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Drive

## Purpose
Google Drive integration for managing fleet-related media. Handles photo listing from organized drive folders (trip/vehicle-based structure) and file uploads with automatic folder creation. No database writes — this is purely a Drive API wrapper with minimal side effects.

## Subdirectories
- [`photos`](photos/AGENTS.md) — List photos from a Drive folder hierarchy (emprunt/rendu subfolders or flat mode for receipts)
- [`photos/[fileId]`](photos/[fileId]/AGENTS.md) — Stream/download individual files from Drive (acts as secure proxy)
- [`upload`](upload/AGENTS.md) — Upload files to Drive with auto-folder creation (vehicle/mission flows)

## For AI Agents

### Working In This Directory
Drive integration always uses the `getDriveClient()` singleton from `@/lib/drive.ts` — it relies on service account auth, so credentials are server-side only. No user tokens required.

**Mock mode:** Routes detect `mock-` prefixed folder/file IDs and return mock data locally (no Drive calls). Useful for preview/dev environments.

**Quota & timeouts:** Drive API calls can fail with quota errors (non-fatal in most flows). Always wrap in try-catch and return friendly French error messages.

**File size limits:** Serverless body limit enforced at 4.2 MB per request. Client should validate before uploading; server validates again for safety.

## Dependencies

### Internal
- `@/lib/drive` — Google Drive service account client (singleton)
- `@/auth` — Authentication check (verify logged-in status, not roles)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
