<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-12 | Updated: 2026-09-12 -->

# qr-stock/[token]

## Purpose
The QR stock landing page. Mobile-first, outside the app shell, reached by scanning a printed label. Lets any signed-in volunteer read a stock and queue movements locally, then submit them in one atomic batch.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Client Component. Loads the stock, owns the cart, switches to a success screen after submission |
| `StockItemRow.tsx` | One item: name, quantity, and the two only actions (`−` / `+`) |
| `BatchPicker.tsx` | Modal shown on `+`: existing FEFO batches, "stock sans date", or a new dated batch |
| `CartSummary.tsx` | Pending movements, per-line cancel, and the single `POST` |
| `types.ts` | `QRStock`, `QRStockItem`, `PendingMovement`, `MAX_MOVEMENTS` |
| `page.module.css` | CSS Module — required here; do not fall back to the inline styles used by `src/app/qr/[token]/page.tsx` |

## For AI Agents

### Working In This Directory

**Closed perimeter — the point of the page:**
- No item creation, renaming or deletion control may appear in the DOM, and no outbound navigation. Same rule as `src/app/qr/AGENTS.md`. Pinned by AC-I2, which asserts these controls are **absent**, not merely hidden.
- The `+` stays enabled at quantity 0: an empty item is exactly the one being restocked (AC-I7). The `−` is disabled there — there is nothing to take.

**The cart must be projected before posting (AC-I6′):**
- `PendingMovement` carries `key` and `itemName`, which are **purely client-side**. The route's Zod schema is `.strict()`: it **rejects** unknown keys rather than stripping them, so posting the cart as-is returns 400 on every submission. The projection lives in `CartSummary.submit()` — keep it there and keep its comment.
- No test tier would catch this on its own: the RTL test mocks `fetch` (it never exercises Zod), and the integration tests build their own conforming body. AC-I6′ asserts the exact key set of the posted body, and the E2E spec is the only end-to-end proof.

**Errors are inline, never `alert()`:**
- The page is used standing in front of a cupboard, phone in hand; a native dialog hides the cart and is hostile there. AC-I8 spies on `window.alert` and requires it never fires.

**The cart is volatile, and says so:**
- Nothing is persisted until "Valider". The warning banner is required (AC-I10) — a volunteer who loses twenty movements to a locked screen will not come back to the feature.
- The 25-movement cap is a **mirror** of the server's Zod bound, not an independent rule. If one moves, move both: `MAX_MOVEMENTS` in `types.ts` and `.max(25)` in the route (AC-I11).

**Testing note:** mock `useRouter` with a **stable** object. `fetchStock` is a `useCallback` depending on it, and a fresh object per render re-runs the loading effect in a loop — a test artifact, since the real Next router is stable.

## Dependencies

### Internal
- `/api/qr-stock/[token]/stock` and `/api/qr-stock/[token]/adjust`
- `@/lib/hooks/useEscapeKey` — modal dismissal in `BatchPicker`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
