<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-12 | Updated: 2026-09-12 -->

# qr-stock

## Purpose
Route container for the inventory QR-code flow. Physical QR labels on stock cupboards encode a `/qr-stock/{token}` URL; scanning one opens a mobile-first screen to read the stock and declare movements. **This directory holds no `page.tsx`** — `/qr-stock` is not a route. All behaviour lives in the dynamic `[token]/` segment.

## Key Files
_None — this directory contains only the `[token]/` segment._

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `[token]/` | The QR landing page: stock name, item list with `−`/`+`, batch picker, pending-movement cart (see `[token]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
Don't add a `page.tsx` here — a bare `/qr-stock` has no meaning without a token, and adding one would create a route that lists or exposes stocks outside the token's scope. Same rule as `src/app/qr/` for vehicles.

The token is opaque and per-stock; it is validated server-side by `/api/qr-stock/{token}/*`, which also scopes every write to that one stock. Any new QR capability belongs in `[token]/` plus a matching endpoint — never widened into a general route.

## Dependencies

### Internal
- `src/app/api/qr-stock/[token]/` — the token-scoped API surface backing this route

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
