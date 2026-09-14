<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-12 | Updated: 2026-09-12 -->

# QR Stock

## Purpose
Consumption endpoints for the inventory QR code flow. A physical QR code printed on a stock cupboard resolves to `InvStockList.qrToken`; scanning it lets any signed-in volunteer read the stock and post a cart of movements — without any role or UL check. Sibling of `api/qr/` (vehicles), same auth model, different domain.

## Subdirectories
- `[token]/` — dynamic QR token container
  - `stock/` — resolve token → stock + items + non-empty batches (FEFO)
  - `adjust/` — apply a cart of movements, all-or-nothing

## For AI Agents

### Key Concepts

**QR auth model** (identical to `api/qr/`):
- `session?.user` required (401), then `isQrBlocked()` (403 `'Compte inactif'`).
- INACTIF is **dominant**: `['INACTIF','CHVL']` is refused. `'GUEST'` is a legacy value treated the same.
- An account with **no role at all is allowed** — the single, deliberate divergence from `isInactive()`.

**No UL barrier — deliberate, argued, do not "harmonise":**
- Neither route filters on `ulId`. Whoever holds the printed QR can read and adjust the stock, whatever their local unit. The guardrail is the named trace in `InvStockLog` (`userName` is `NOT NULL`), not a UL boundary. Pinned by AC-R6 / AC-A16.
- This does **not** extend to `/api/inventory/stocks/[id]/qr-token`, which **is** UL-scoped. Fabricating a token is not scanning one: without that scope anyone could enumerate stock IDs and mint access without ever seeing a QR. Two different questions, two different answers — keep them apart.

**Every write is scoped by the token:**
- The only boundary is `InvItem.stockId = (stock resolved from the token)`, checked in SQL **before** the transaction opens. An `itemId` from another stock → 404, nothing written (AC-A6).

**Cart semantics (`adjust`):**
- Zod is `.strict()` with `max(25)` movements and `change` an int in `[-10 000, 10 000]`, non-zero. Strictness is load-bearing: `deductFromNoDate` is **refused** (400), not silently stripped, and the client must project its cart before posting — `PendingMovement` carries `key`/`itemName`, which would be rejected.
- All movements run in **one** `db.transaction('write')`, written through `runStatements` in batches. A partial failure would leave a half-adjusted inventory nobody could reconstruct.
- Validation, `ensureStockTableExists()` and token resolution happen **outside** the transaction, on purpose: a SQLite write transaction locks the whole database, so its lifetime is an application-wide write outage. Do not move them inside.
- Movement order is preserved and `planStockMovement` mutates its state map in place: movement N starts from what N-1 left. Never parallelise, never regroup by item.

**Response shapes:**
- `GET .../stock` → `{ stock: { id, name }, items: [{ id, name, category, quantity, minStock, batches: [{ expiryDate, quantity }] }] }`. Batches are filtered to `quantity > 0` and FEFO-ordered.
- `POST .../adjust` → `{ success: true, applied }`. No `newQuantity` here: the planner's total is an indicative display value and has no business crossing this boundary.

## Dependencies

### Internal
- `@/lib/db` (singleton), `@/auth`
- `@/lib/roles` — `isQrBlocked()`
- `@/lib/inventory/stocks` — `resolveStockByQrToken()`, `ensureStockTableExists()`
- `@/lib/inventory/adjustments` — `loadItemBatchStates()`, `planStockMovement()`, `runStatements()`

### Tables Touched
- `InvStockList` (token lookup), `InvItem` (membership check, quantity resync), `InvBatch` (movements), `InvStockLog` (one named row per movement)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
