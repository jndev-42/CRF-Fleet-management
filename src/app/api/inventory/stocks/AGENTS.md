<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Stocks

## Purpose
Manage stock containers (storage locations/groups). Each user's `ulId` can have multiple named stock lists. Default stock auto-created. Core operations: list, create, rename, delete (with cascading cleanup). Requires authentication. Write operations require ADMIN+ role.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list stocks), POST (create stock, ADMIN+), PATCH (rename stock, ADMIN+), DELETE (delete stock, ADMIN+) |
| `duplicate/route.ts` | POST (duplicate a stock into a **new** stock of the same UL, ADMIN+) |

## For AI Agents

### Working In This Directory
**Roles:** GET requires authentication (401). POST/PATCH/DELETE require ADMIN+ (403).

**GET business rules:**
- Lists all stock containers for user's `ulId`
- Auto-creates default stock if not present (via `getOrCreateDefaultStock`)
- Sorted by `isDefault DESC` (default first), then `createdAt ASC`

**POST business rules:**
- Creates new named stock container
- `name` required, non-empty string (trimmed)
- Auto-creates default stock beforehand (idempotent)
- New stock starts with `isDefault = 0`
- Returns: ID, name, ulId, isDefault

**PATCH business rules:**
- Renames existing stock
- `id` and `name` both required (valid strings, name trimmed)
- Only updates stocks owned by user's `ulId` (404 if not found)
- Returns: ID, name (trimmed value)

**DELETE business rules:**
- Deletes stock and cascades to all related data:
  1. Delete all `InvBatch` records for items in this stock
  2. Delete all `InvStockLog` records for items in this stock
  3. Delete all `InvItem` records in this stock
  4. Delete the stock from `InvStockList`
- Prevents deletion of last stock (user must have >= 1 stock)
- If deleted stock was default, promotes oldest remaining stock to default
- Only deletes stocks owned by user's `ulId` (404 if not found)

**POST `/duplicate` business rules:**
- Creates a **new** stock from an existing one. Never merges into an existing stock, never crosses UL boundaries.
- Body: `{ sourceStockId: string, name: string, copyStock?: boolean }` (`copyStock` defaults to `false`).
- Returns `404 "Stock source introuvable"` when `sourceStockId` does not belong to the session's `ulId`.
- Returns `201` with the freshly re-read `InvStockList` row (so `createdAt` / `updatedAt` are present) plus `itemsCopied` and `batchesCopied`.
- Item columns copied: `name`, `category`, `minStock`, `notes`, `ulId` — the exact column list of the INSERT in `../../route.ts` (`unit` is vestigial and deliberately excluded).
- `copyStock: false` → items only, `quantity = 0`, no `InvBatch`, no `InvStockLog`.
- `copyStock: true` → every `InvBatch` copied 1:1 (quantity **and** expiryDate live in the same row and are inseparable); `InvItem.quantity` = `SUM(batch.quantity)`; **one** `InvStockLog` per item whose total is `> 0`, with `note = "Import initial — dupliqué depuis <source name>"`.
- One `InvStockLog` line is written whenever the item's total is **non-zero** (not merely positive): a negative legacy total still deserves a trace, since a non-zero stock with no history is the very thing this design avoids.
- **`InvStockLog` is never copied from the source.** It is an audit journal — cloning movements that never happened in the new stock would produce a false history.
- Delegates to `duplicateStock()` in `@/lib/inventory/stocks`. **Reads and writes both run inside a single `db.transaction('write')`**, so a concurrent `adjust` cannot make the copy reflect a snapshot that never coherently existed. Only `ensureStockTableExists()` (DDL) runs before the transaction opens.
- The `catch` isolates `tx.rollback()` in its own `try`: if the transaction was already aborted by SQLite, the rollback's own error would otherwise mask the real cause in the logs.
- Does **not** call `getOrCreateDefaultStock()`: that function reassigns orphan items (`UPDATE "InvItem" SET stockId`), an unwanted side effect here. Only `ensureStockTableExists()` is needed, and it runs before the transaction opens.
- Source batches are read with a grouped `IN (?, …)` chunked at 500 ids, to stay under SQLite's bound-variable ceiling.
- Writes are assembled in memory and sent through `tx.batch()` in chunks of 500 statements. A duplication issues `1 + 2N` statements; sending them one at a time would mean thousands of sequential round trips to Turso and would blow the route's `maxDuration`. Note that `tx.batch()` stops at the first failing statement but does **not** roll back on its own — the explicit `tx.rollback()` in the `catch` is what guarantees atomicity.
- Non-idempotent by design: two identical calls create two stocks. The guard is the UI's `submitting` flag.

**Non-obvious validation:**
- Cannot delete last remaining stock (400)
- Duplicate: `name` is trimmed; empty after trim → 400
- Duplicate: items are selected on `stockId` **and** `ulId`, so a mis-attached item never crosses UL boundaries
- All cascading deletes must complete before stock list delete
- Default stock auto-promotion uses `createdAt ASC` to pick next default

**Side effects:**
- POST auto-creates default stock (idempotent)
- DELETE cascades all related records
- All write operations update `updatedAt` timestamp on stock record
- DELETE may change `isDefault` on another stock record

## Dependencies

### Internal
- Database: `InvStockList`, `InvItem`, `InvBatch`, `InvStockLog`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`), `@/lib/inventory/stocks` (`getOrCreateDefaultStock`, `duplicateStock`), `@/lib/apiAuth`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
