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

**Stock movement logic lives in `@/lib/inventory/adjustments`, not in the routes.**
- `POST /api/inventory/adjust` is a thin wrapper: auth, Zod, the UL check, then `loadItemBatchStates` → `planStockMovement` → `db.batch`. The same three functions back `POST /api/qr-stock/[token]/adjust`. Do not reimplement FEFO, batch creation or quantity resync anywhere else — the danger is not the FEFO rule itself but its interaction with resync, which corrupts quantities silently when the two copies drift.
- `InvItem.quantity` is resynced by `RESYNC_ITEM_QUANTITY_SQL`, a **correlated subquery**. Never write it from a total computed in memory: `/api/inventory/adjust` reads outside a transaction, so persisting a previously-read total would silently overwrite a batch inserted meanwhile. `PATCH /api/inventory/batches` uses the same constant.
- `newQuantity` in the adjust response is the planner's **predicted** total, kept for `src/app/inventory/page.tsx`, which paints it on the row without reloading. It is a display value; never derive a decision from it, and do not propagate it to the QR route.

**`/stocks/[id]/qr-token`** returns (and lazily creates) the stock's QR token. All three verbs carry `isQrBlocked` **before any DB read**: a blocked account is a perfectly legitimate UL member as far as the UL scope is concerned, a token is a transmissible secret it can hand to a third party, and `getOrCreateStockQrToken` *writes* the token when missing — so the read is already a side effect. On `DELETE` the role gate alone is not enough: `canAccessAdminPanel` is satisfied by `['ADMIN','INACTIF']`, and a blocked admin would otherwise regenerate tokens and kill every printed QR. It is also **scoped on the stock's UL** — unlike the `/api/qr-stock/[token]/*` consumption routes, which have no UL filter at all. Fabricating a token is not scanning one; without the scope, any account could enumerate stock ids and mint QR-bypass access without ever seeing a printed code. See `src/app/api/qr-stock/AGENTS.md`.

**`qrToken` never appears in any other response.** `GET /api/inventory/stocks` and `POST /api/inventory/stocks/duplicate` project columns explicitly — no `SELECT *` on `InvStockList`. Pinned by AC-T9/AC-T10.

## Dependencies

### Internal
- Database: `InvItem`, `InvBatch`, `InvStockLog`, `InvStockList` (including `InvStockList.qrToken`)
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`), `@/lib/inventory/stocks` (`getOrCreateDefaultStock`, `getOrCreateStockQrToken`, `regenerateStockQrToken`), `@/lib/inventory/adjustments` (`loadItemBatchStates`, `planStockMovement`, `RESYNC_ITEM_QUANTITY_SQL`, `FEFO_ORDER_BY`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
