<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# martine (CRF Fleet Management)

## Purpose
A Next.js fleet-management application for the Croix-Rouge française (CRF): vehicle reservations, trip check-in/checkout, incident and expense reporting, inventory, maintenance tracking, and Renault Connect telemetry integration. French-language UI, role-gated access.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | Scripts, dependencies (Next.js 16, React 19, NextAuth v5, `@libsql/client`) |
| `CLAUDE.md` | Primary human/AI onboarding doc — commands, stack, conventions (read this first) |
| `next.config.ts` | Next.js config (uses `--webpack`, not Turbopack) |
| `vitest.config.ts` | Unit/integration test config |
| `playwright.config.ts` | E2E test config |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `src/` | Application source (see `src/AGENTS.md`) |
| `scripts/` | One-off DB migration/setup scripts, run via `npx tsx` (see `scripts/AGENTS.md`) |
| `e2e/` | Playwright end-to-end specs (see `e2e/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- This project also maintains directory-scoped `CLAUDE.md` files (root + several subdirectories) — where both exist, `CLAUDE.md` is the authoritative, actively-maintained source; this `AGENTS.md` hierarchy mirrors and cross-references it for tools that read `AGENTS.md` instead.
- Direct SQL via `@libsql/client` — no ORM. Always parameterized: `{ sql: "... WHERE id = ?", args: [id] }`.
- Auth: production = Google OAuth2 (`@croix-rouge.fr`), dev = credentials (`@dev.local`). Roles in JWT: `ADMIN > RESPO > CHVL > CHVPSP > GUEST`.
- Pages are Client Components with `useEffect` data fetching (Server Component migration is planned as M-4 but **not started** — don't convert yet).
- Creating a new component/modal → invoke `/component-templates` skill. New page → `/page-template`. New API route file → `/api-route-template`.

### Testing Requirements
`npm run test` (Vitest) must pass; every new feature ships with tests (see `src/__tests__/AGENTS.md`). `npm run lint` must produce 0 errors and 0 warnings (enforced by a pre-commit hook).

### Common Patterns
CSS Modules per component + global CSS variables (`app/globals.css`), `next-themes` for dark/light. See `src/lib/AGENTS.md` for singleton services (db, renault, drive, email, onesignal).

## Dependencies

### External
- Next.js 16 (App Router), React 19, TypeScript
- Turso (libSQL/SQLite cloud) via `@libsql/client`
- NextAuth v5 — auth
- `googleapis` — Google Drive integration
- `@remscodes/renault-api` — Renault Connect telemetry
- `react-onesignal` — push notifications
- `@react-pdf/renderer` — PDF export
- `nodemailer` — email

### External services
Vercel (deployment, auto-deploy on `main`), Turso (DB cloud), Google Drive (photo storage), OneSignal (push), Renault Connect API (vehicle telemetry).

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
