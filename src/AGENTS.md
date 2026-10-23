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
Roles enforced via `session.user.roles` in both API routes and UI. There is no linear hierarchy; the roles are defined in `lib/roles.ts` (`ROLES`, `ROLE_LABELS`) and checked through its predicates: `SUPER_ADMIN` (all ULs) and `ADMIN` (own UL) = `isAdminOrAbove`; `PRESIDENT` and `CADRE` = read-only managers (`isReadOnlyManager`; with the two above they form `canAccessAdminPanel`); `TRESORIER` pays expense reports; `RESPO` = *responsable d'activité*, whose only power is the first validation step of expense reports (`canValidateExpenseAsRespo`) — no admin panel, no fleet management; `RESP_VEHICULE` = *responsable véhicule*, ADMIN rights on the vehicles of its UL only (`canManageVehicles`; with PRESIDENT = `canSuperviseVehicles` for metrics/QR; with CADRE = `canManageReservations`) — no admin panel, no other module; `RESP_UNIFORME` = *responsable uniforme*, ADMIN rights on the uniforms of its UL only (`canManageUniforms`: history, loans, management, QR) — no admin panel, no other module; CADRE manages reservations but not vehicles; `CHVL`/`CHVPSP` drivers; `CI/RPAPS` mission reports; `DT` DT view of vehicles; `INACTIF` blocks everything, whatever other roles are held.

Both `auth.ts` callbacks (`jwt` and `session`) delegate role resolution to the single `resolveSessionRoles()` in `lib/session-roles.ts` — they each carried a copy that had already drifted apart. `token.roles` is used only on the `catch` path (database unreachable: serve the last known value rather than log everyone out). It is **not** a cascade fallback: putting it back would make roles sticky and a revocation would never take effect.

## Dependencies

### Internal
- `lib/db.ts` — the single DB client, imported throughout `app/`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
