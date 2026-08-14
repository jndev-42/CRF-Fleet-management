<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# auth

## Purpose
NextAuth v5 authentication handler. Manages OAuth2 (Google), credentials login, session creation, and JWT token generation. No direct database writes here — auth logic is configured in `src/auth.ts`. This route handles the full auth flow including callbacks, session management, and the `/api/auth/signin` and `/api/auth/signout` endpoints via the `[...nextauth]` dynamic handler.

## Subdirectories
- `[...nextauth]` — NextAuth dynamic route handler (GET, POST for signin, callback, signout, session)

## For AI Agents

### Working In This Directory
This directory contains only the NextAuth catch-all route via the `[...nextauth]` dynamic segment. The actual auth configuration (strategy, roles, callbacks) lives in `src/auth.ts`. Never modify the route.ts handler directly — it exports handlers from `@/auth`. All role assignments happen in the JWT callback in `src/auth.ts`.

## Dependencies

### Internal
- `src/auth.ts` — Full auth config, strategies, callbacks, role assignment

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
