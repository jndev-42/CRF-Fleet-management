<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory API

## Purpose
Inventory management API for tracking medical supplies and goods across multiple stock locations. Manages items, batches with expiry tracking, stock adjustments with FEFO (First Expiry First Out) logic, and low-stock alerts. Core database tables: `InvItem`, `InvBatch`, `InvStockLog`, `InvStockList`. Requires authentication; write operations require ADMIN+ role.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `adjust/` | Adjust item quantities with batch-level tracking and FEFO withdrawal logic |
| `batches/` | Retrieve and manage individual batch records, including expiry dates and quantities |
| `expiring-soon/` | Query items expiring within one month, sorted by expiry date |
| `history/` | Retrieve stock change history/audit logs for an item |
| `low-stock/` | Query items below their minimum stock threshold |
| `stocks/` | Manage stock containers (storage locations/groups) for organizing inventory |

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list items, categories, pagination), POST (create item, ADMIN+), PATCH (update item, ADMIN+), DELETE (delete item, ADMIN+) |

## For AI Agents

### Working In This Directory
**Roles:** All endpoints require authentication (401). POST/PATCH/DELETE require ADMIN+ (403).

**Core business rules:**
- Items scoped by user's `ulId` and belong to one `stockId`
- Quantities auto-sync from `InvBatch` totals (never manually set in `InvItem`)
- Creating item with quantity > 0 creates initial `InvBatch` and logs the change
- Category and minStock are optional; null minStock disables low-stock alerts
- Search/filter operates on name and category (LIKE queries)
- Default stock auto-created on first access via `getOrCreateDefaultStock(ulId)`

**Non-obvious validation:**
- `minStock` field can be null/empty string → converted to NULL (disables alert)
- `quantity` on POST is initial quantity — actual stock stored in `InvBatch`
- `nearestExpiry` field on GET computed as MIN(expiryDate) from non-zero batches

**Side effects:**
- POST creates log entry if quantity > 0
- POST creates initial batch if quantity > 0
- PATCH does NOT create logs (metadata-only update)
- PATCH does NOT cascade to batches
- DELETE cascades to... (none — deletes only the item; batches remain orphaned — verify this)

## Dependencies

### Internal
- Database: `InvItem`, `InvBatch`, `InvStockLog`, `InvStockList`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`), `@/lib/inventory/stocks` (`getOrCreateDefaultStock`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
