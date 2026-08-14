<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# qr

## Purpose
Route container for the QR-code access flow. Physical QR stickers on each vehicle encode a `/qr/{token}` URL; scanning one opens a mobile-first, single-vehicle check-out/check-in screen. **This directory holds no `page.tsx`** — `/qr` itself is not a route. All behaviour lives in the dynamic `[token]/` segment.

## Key Files
_None — this directory contains only the `[token]/` segment._

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `[token]/` | The QR landing page: vehicle summary, check-out and check-in forms, incident declaration (see `[token]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
Don't add a `page.tsx` here — a bare `/qr` has no meaning without a token, and adding one would create a route that lists or exposes vehicles outside the token's scope.

The token is opaque and per-vehicle; it is validated server-side by the `/api/qr/{token}/*` routes, which also scope every action to that one vehicle. Any new QR capability belongs in `[token]/` plus a matching `api/qr/[token]/` endpoint — never widened to a general route.

## Dependencies

### Internal
- `src/app/api/qr/[token]/` — the token-scoped API surface backing this route

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
