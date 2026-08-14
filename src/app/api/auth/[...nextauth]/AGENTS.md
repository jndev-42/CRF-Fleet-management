<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [...nextauth]

## Purpose
NextAuth v5 dynamic catch-all route handler. Exports GET and POST handlers from `src/auth.ts`. Routes all auth requests (`/api/auth/signin`, `/api/auth/callback`, `/api/auth/session`, `/api/auth/signout`, etc.) to the configured providers and callbacks.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | Exports NextAuth handlers (GET, POST) — no auth check needed, handles OAuth callback and session tokens |

## For AI Agents

### Working In This Directory
This route.ts is a pure pass-through to NextAuth handlers. Do not add custom logic here. OAuth callback, role assignment, and session management happen in `src/auth.ts`. If adding a new auth provider or callback, edit `src/auth.ts` and the callbacks, then restart the dev server. The route responds to all `/api/auth/*` paths via the catch-all segment.

## Dependencies

### Internal
- `src/auth.ts` — Handlers and auth configuration (strategies, providers, callbacks)
- `@/lib/db` — User lookup in callbacks (if custom callback queries needed)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
