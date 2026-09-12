<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-09-12 -->

# Inventory — Stock Management

## Purpose
Manages inventory stock lists at the UL level. Provides helper functions to ensure stock tables exist, create default stocks for new ULs, and assign orphan inventory items to their default stock on initialization.

## Key Files
| File | Description |
|------|-------------|
| `stocks.ts` | Exports `ensureStockTableExists()`, `getOrCreateDefaultStock()`, `duplicateStock()`, and the QR token helpers `getOrCreateStockQrToken()` / `regenerateStockQrToken()` / `resolveStockByQrToken()` |
| `adjustments.ts` | Single implementation of the stock movement rule (FEFO, batch creation, quantity resync), shared by `/api/inventory/adjust` and `/api/qr-stock/[token]/adjust` |

## For AI Agents

### Working In This Directory
- `ensureStockTableExists()` creates the `InvStockList` table if absent and ensures `InvItem` has a `stockId` column
- `getOrCreateDefaultStock(ulId)` fetches or creates a default stock named "Stock Principal" for a given UL
- Orphan `InvItem` rows (null or empty `stockId`) are automatically assigned to the default stock
- SQL uses parameterized queries: `{ sql: "...", args: [...] }` — always via `db.execute()`
- Return type is `InvStockListRow` with typed fields (id, name, ulId, isDefault, createdAt, updatedAt)
- If modifying schema, coordinate with inventory-item and inventory-category modules that reference `InvStockList`

#### `InvStockList.qrToken` — a secret, not a field
- `qrToken` is deliberately **absent from `InvStockListRow`**, and no `SELECT *` is issued on `InvStockList` anywhere the row is returned to a client. Whoever holds the token can adjust the stock with **no role and no UL check**: leaking it in `GET /api/inventory/stocks` would hand the QR to the whole UL on every Inventory page load. Pinned by AC-T9 / AC-T10.
- DDL for the column **and** its unique partial index lives in `ensureStockTableExists()`, each behind its **own** `PRAGMA` guard (`table_info`, then `index_list`). The index guard is separate on purpose: it covers a fresh database (column created by `CREATE TABLE`, so the column guard never fires) and a migrated one in a single shot. Never emit `CREATE INDEX` outside that guard — this function sits on the hot path of `GET /api/inventory`, and an unguarded emission would be paid on every request. Pinned by AC-S5 / AC-S6.
- `resolveStockByQrToken()` does **not** call `ensureStockTableExists()`: it is the hot path of every scan, and a `SELECT` on a missing column raising is the correct signal that the production migration (`scripts/add-stock-qr-token.ts --apply`) has not been run.

#### `adjustments.ts` — three phases, never one statement at a time
- Shape is **grouped read → pure planner → batched execution**, not one round trip per statement. A 25-movement cart would otherwise cost 125-175 sequential round trips under a single `BEGIN IMMEDIATE`, and a SQLite write transaction locks the **whole** database: its lifetime is an application-wide write outage.
- Validation, DDL and token resolution happen **before** opening the transaction. Do not "optimise" by moving them inside — that cancels the entire gain.
- `RESYNC_ITEM_QUANTITY_SQL` is a **correlated subquery**, never a total computed in memory and written back: a batch inserted by a concurrent writer between read and write is then counted rather than silently overwritten. `COALESCE(…, 0)` is mandatory (`InvItem.quantity` is `NOT NULL`). Pinned by AC-U8 / AC-N6.
- Statement **order matters**: batch writes, then the resync, then the log. `batch()` runs sequentially inside the transaction, so the subquery must come after the writes it has to see. Pinned by AC-U7.
- `planStockMovement` mutates its `states` map **in place** and in sequence. Do not plan movements in parallel, and do not group them by item if that loses cart order.

## Dependencies

### Internal
- `@/lib/db` (single `db` client, always imported as singleton)

