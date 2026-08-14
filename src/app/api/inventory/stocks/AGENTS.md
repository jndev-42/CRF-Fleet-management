<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Stocks

## Purpose
Manage stock containers (storage locations/groups). Each user's `ulId` can have multiple named stock lists. Default stock auto-created. Core operations: list, create, rename, delete (with cascading cleanup). Requires authentication. Write operations require ADMIN+ role.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list stocks), POST (create stock, ADMIN+), PATCH (rename stock, ADMIN+), DELETE (delete stock, ADMIN+) |

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

**Non-obvious validation:**
- Cannot delete last remaining stock (400)
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
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`), `@/lib/inventory/stocks` (`getOrCreateDefaultStock`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
