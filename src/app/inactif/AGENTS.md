<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# inactif

## Purpose
Dead-end page (`/inactif`) shown to users whose account has been deactivated. It displays a lock icon, the message "Compte inactif — Votre compte a été désactivé. Contactez un administrateur pour le réactiver.", and a single sign-out button. Users are routed here rather than to the app so a disabled account cannot reach any feature page.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | 22-line Client Component — full-height `empty-state` block with a `signOut({ callbackUrl: '/login' })` button. |

## For AI Agents

### Working In This Directory
**No role required** — this page is intentionally reachable by any signed-in user, because its whole purpose is to serve people who have lost access. It fetches nothing and reads no session; it is pure static markup plus one action.

Redirection *into* this page is decided elsewhere (auth callbacks / `src/middleware.ts`), not here. If deactivated users are landing somewhere else, fix the redirect at the source — do not add guards to this file.

The sign-out button uses `signOut` from `next-auth/react` with `callbackUrl: '/login'`, so logging out lands on the login screen rather than back on `/inactif`.

Keep this page minimal and dependency-free. Anything that fetches data risks 401/403 loops for exactly the users who see it.

## Dependencies

### Internal
- `next-auth/react` — `signOut`
- Global CSS classes: `empty-state`, `empty-state-icon`, `empty-state-title`, `btn btn-secondary`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
