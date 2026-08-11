<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# src

## Purpose
Application source root: Next.js App Router pages/API routes, shared React components, and library singletons (DB, auth, external integrations).

## Key Files
| File | Description |
|------|-------------|
| `auth.ts` | Full NextAuth v5 config (providers, JWT callbacks, roles) |
| `auth.config.ts` | Edge-safe auth config subset (used by middleware) |
| `proxy.ts` | Request proxy/middleware helper |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `app/` | Pages and API routes (App Router) (see `app/AGENTS.md`) |
| `components/` | Shared UI components (see `components/AGENTS.md`) |
| `lib/` | Singleton services and integrations (see `lib/AGENTS.md`) |
| `__tests__/` | Vitest unit/integration/component tests (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory
Auth logic is split: `auth.ts` (full config, Node runtime) vs `auth.config.ts` (Edge-safe subset for middleware). Don't add Node-only APIs to `auth.config.ts`.

### Testing Requirements
See `src/__tests__/AGENTS.md` for mocking patterns and the request factory.

### Common Patterns
Roles enforced via `session.user.roles` in both API routes and UI. Role hierarchy: `ADMIN > RESPO > CHVL > CHVPSP > GUEST`.

## Dependencies

### Internal
- `lib/db.ts` — the single DB client, imported throughout `app/`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
