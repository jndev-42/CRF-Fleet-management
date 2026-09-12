<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-12 | Updated: 2026-09-12 -->

# QR Stock — [token]

## Purpose
Dynamic segment holding the two QR stock endpoints. `[token]` is the raw `InvStockList.qrToken` value (a UUID), read straight from the scanned URL — it is the **only** access boundary of this flow.

## Subdirectories
- `stock/` — `GET`, resolve token → stock + items + batches
- `adjust/` — `POST`, apply a cart of movements

## For AI Agents

### Working In This Directory
- Handler signature is always `{ params }: { params: Promise<{ token: string }> }` — **always `await params`**.
- Unknown token → **404** with the exact body `{ error: 'QR Code invalide ou expiré' }`, same wording as the vehicle QR route. Do not leak whether the stock exists by any other means.
- `resolveStockByQrToken()` deliberately skips `ensureStockTableExists()`: this is the hot path of every scan. Before the production migration is applied (`scripts/add-stock-qr-token.ts --apply`), a `SELECT` on the missing column raises — that 500 is the intended signal, not a bug to paper over.
- **Never add a `ulId` filter here.** See the parent `AGENTS.md`: the absence of a UL barrier is the decision, and it is pinned by AC-R6 / AC-A16.
- **Never widen the scope.** No item creation, renaming or deletion path, and no outbound navigation — same closed-perimeter rule as `src/app/qr/AGENTS.md`. The page that consumes these routes is deliberately a dead end.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
