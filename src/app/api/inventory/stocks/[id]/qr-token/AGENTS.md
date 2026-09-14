<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-12 | Updated: 2026-09-12 -->

# Inventory Stocks — [id]/qr-token

## Purpose
Mints, returns and regenerates the QR token of one inventory stock. This is the **fabrication** side of the stock QR flow; the **consumption** side lives in `src/app/api/qr-stock/[token]/`. The distinction between the two is the whole point of this directory — see below before changing anything here.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | `GET` / `POST` return the token, creating it on first request; `DELETE` regenerates it (admin only) |

## For AI Agents

### Working In This Directory

**`GET` and `POST` are the same handler.** `POST` delegates to `GET` and therefore inherits *all* its guards. Never rewrite it as an independent copy — the guards would drift apart at the first edit.

**`DELETE` is destructive.** It replaces the token, which **instantly invalidates every QR code already printed and glued to a cupboard**. There is no undo and no history: the previous token is overwritten, and any scan of an old label returns 404. It is gated on `canAccessAdminPanel`, and the modal asks for confirmation before calling it (AC-Q5/AC-Q6).

#### Why this route is UL-scoped while the consumption routes are not

This is the least guessable thing in the whole feature. **It is not an inconsistency, and it must not be "harmonised".**

The approved design decision — *whoever holds the printed QR may read and adjust the stock, whatever their local unit* — is about **scanning a physical code**. It says nothing about the right to **enumerate tokens through the API**.

Without the UL scope, any signed-in account could walk the stock ids and obtain the token of every stock in the organisation — that is, **fabricate** QR-bypass access without ever seeing a printed code, silently and without a trace. The premise the entire threat model rests on ("the token is a secret that may leak by accident, and the named trace in `InvStockLog` bounds the damage") would collapse: leaking would stop being an accident and become a right on request.

Put plainly: **the QR bypasses roles and ULs; the API that manufactures it does not.**

So:
- here (`/api/inventory/stocks/[id]/qr-token`) → the stock's UL is checked on all three verbs, and a cross-UL caller gets **403 even if they are ADMIN of their own UL** (AC-T11);
- there (`/api/qr-stock/[token]/*`) → **no UL filter at all**, deliberately (AC-R6, AC-A16).

Both properties are pinned by tests. Changing either one means changing the threat model, not tidying up an oversight.

#### `isQrBlocked` on all three verbs, before any DB read

A blocked account (`INACTIF`, or the legacy `GUEST`) is a perfectly legitimate UL member as far as the UL scope is concerned, so the scope alone does not stop it. `/api` sits outside the middleware matcher (`src/proxy.ts`), so the `/inactif` redirect never fires here either. Hence an explicit guard, and it comes **first**:

- a token is a **transmissible secret**. The blocked account cannot use it itself — `/api/qr-stock/[token]/*` refuses it — but nothing stops it handing the token to someone else, who then acts with no trace leading back to it;
- `getOrCreateStockQrToken` **writes** the token when it is missing, so merely reading is already a side effect. A late refusal would have already minted the secret;
- on `DELETE`, the role gate is not enough: `canAccessAdminPanel(['ADMIN','INACTIF'])` is **true**. A blocked administrator would otherwise regenerate tokens and invalidate every printed QR — denial of service on the feature.

An account with **no role at all is still allowed** — that is the deliberate divergence between `isQrBlocked` and `isInactive`, and a test pins it. Do not "fix" it.

#### Other invariants
- Order of checks on `DELETE`: session → `isQrBlocked` → UL scope → `canAccessAdminPanel`. The UL scope precedes the role check on purpose: an admin of another UL has no more business regenerating this token than reading it.
- `params` is a `Promise` — always `await params`.
- `qrToken` must never leak into any other response. `GET /api/inventory/stocks` and `.../duplicate` project columns explicitly; there is no `SELECT *` on `InvStockList` (AC-T9/AC-T10).
- ⚠️ `/api/vehicles/[id]/qr-token` carries the same shape **without** the UL scope. That is a known gap, documented in its own `AGENTS.md`, out of scope for this PR. It is the older route that is behind — do not align this one down to it.

## Dependencies

### Internal
- `@/auth`, `@/lib/apiAuth` — `unauthorizedResponse`, `forbiddenResponse`
- `@/lib/roles` — `isQrBlocked`, `canAccessAdminPanel`
- `@/lib/inventory/stocks` — `ensureStockTableExists`, `getOrCreateStockQrToken`, `regenerateStockQrToken`

### Tables Touched
- `InvStockList` (`ulId` for the scope check, `qrToken` read/write)

### Tests
- `src/__tests__/integration/inventory-stock-qr-token.test.ts` — AC-T1 → AC-T7, AC-T11, and the inactive-account guard on all three verbs

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
