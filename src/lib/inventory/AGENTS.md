<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory — Stock Management

## Purpose
Manages inventory stock lists at the UL level. Provides helper functions to ensure stock tables exist, create default stocks for new ULs, and assign orphan inventory items to their default stock on initialization.

## Key Files
| File | Description |
|------|-------------|
| `stocks.ts` | Exports `ensureStockTableExists()`, `getOrCreateDefaultStock()` for stock initialization and orphan item assignment |

## For AI Agents

### Working In This Directory
- `ensureStockTableExists()` creates the `InvStockList` table if absent and ensures `InvItem` has a `stockId` column
- `getOrCreateDefaultStock(ulId)` fetches or creates a default stock named "Stock Principal" for a given UL
- Orphan `InvItem` rows (null or empty `stockId`) are automatically assigned to the default stock
- SQL uses parameterized queries: `{ sql: "...", args: [...] }` — always via `db.execute()`
- Return type is `InvStockListRow` with typed fields (id, name, ulId, isDefault, createdAt, updatedAt)
- If modifying schema, coordinate with inventory-item and inventory-category modules that reference `InvStockList`

## Dependencies

### Internal
- `@/lib/db` (single `db` client, always imported as singleton)

