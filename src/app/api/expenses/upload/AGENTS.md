<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-28 -->

# Upload

## Purpose
Deposit expense-report justificatif files (receipts) into transient Cloudflare R2 staging while a report is still a draft. Compresses images on upload. Files are embedded as pages of the sealed PDF at first submission (`sealStep1`), then deleted from staging — never referenced from a submitted report.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST — deposit receipt files to R2 staging |

## For AI Agents

### Working In This Directory

**POST:**
- Content-Type: `multipart/form-data`
- Form fields:
  - `files` (required): Receipt files (images or PDFs)
  - `stagingId` (optional): Reuse existing staging id to append more files under the same prefix
- Auth: Login check only; no role restrictions
- File validation: max 4.2 MB per file, 4.2 MB total per request (Vercel serverless body limit headroom); must be image or PDF
- Images are compressed (`compressJustificatifImage`) before storage; PDFs are stored as-is
- R2 key: `expenses-staging/{stagingId}/{uuid}-{filename}` via `buildExpenseStagingKey`
- Returns: `{ success: true, stagingId, keys }` — the NEW keys from this call; the frontend accumulates the full list itself

**Side effects:** Writes to R2 staging prefix. Nothing is deleted here — cleanup happens in `sealStep1`/`persistSealed` once the report is actually submitted.

**Error handling:** File size or validation errors return 400 with French error messages. R2 errors return 500.

## Dependencies

### Internal
- `@/lib/expenses/attachments` — image compression
- `@/lib/r2` — staging key + object storage
- `@/auth` — Login check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
