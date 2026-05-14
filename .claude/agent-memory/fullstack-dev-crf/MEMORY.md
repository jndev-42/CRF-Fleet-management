# Agent Memory — martine

## Current Version
- package.json + CHANGELOG.md: **v2.3.1** (as of 2026-03-25)
- Footer version: uses `process.env.NEXT_PUBLIC_APP_VERSION` injected from `package.json` via `next.config.ts` — NOT hardcoded

## Project Structure
- Next.js 16 App Router, React 19, TypeScript, libSQL (`@libsql/client`)
- Auth: `import { auth } from '@/auth'` (server-side), `useSession` / `signOut` from `next-auth/react` (client-side)
- DB: raw SQL via `db.execute()` from `@/lib/db` — no Prisma
- Zod for all API validation
- Middleware: `src/middleware.ts` — handles INACTIF redirect

## Key File Paths
- API routes: `src/app/api/`
- Shared modal components: `src/components/vehicle/modals/`
- Renault integration: `src/lib/renault.ts`
- Auth config: `src/auth.ts`
- DB client: `src/lib/db.ts`
- Stats logic: `src/lib/stats.ts`
- Next config: `next.config.ts`
- Footer version: auto-injected from `package.json` via `NEXT_PUBLIC_APP_VERSION`

## Auth Patterns
- Server route auth check: `const session = await auth();` at the very top
- 401 for unauthenticated: `!session?.user`
- 403 for insufficient role: `!session?.user?.roles?.includes('ADMIN')`
- **Exception**: `POST /api/vehicles` uses a **single 403 guard** — no separate 401
- Vehicle [id] route uses vehicle **name** as URL param (not UUID)
- **Exception**: checkin route checks auth AFTER trip lookup — 404 before 401
- `session.user.id` available (from `User.id` via JWT `userId` claim)
- Auth checks for trip ownership use `session.user.id === trip.driverId`

## DB Conventions
- Vehicle lookup by name: `WHERE name = ?`
- Vehicle UUID in `Vehicle.id`, needed for checklist/trip FKs
- Booleans stored as 0/1 integers in SQLite
- Trip table uses FK columns `driverId`/`secondDriverId` → `User.id`
- Always JOIN User when fetching trips for display

## Roles (as of v2.3.0)
- Full role list: `ADMIN`, `RESPO`, `CHVL`, `CHVPSP`, `INACTIF` (ex-GUEST), `SECOURISTE`, `CI/RPAPS`
- **INACTIF** (ex-GUEST): completely blocked — middleware redirects to `/inactif` page
- **SECOURISTE** is auto-assigned by `resolveRoles()` to any user with at least one non-INACTIF role
- **CI/RPAPS** gives access to Missions only
- Stats access: all roles EXCEPT INACTIF
- Inventory access: requires `SECOURISTE` role
- Menu API: `GET /api/settings/menus` + `PATCH /api/settings/menus/[key]` — ADMIN only (both methods)

## Vehicle Borrowing Rules (as of v2.3.0)
- ADMIN: can borrow all vehicle types
- CHVPSP only: VPSP vehicles only
- CHVL only: VL vehicles only
- CHVL + CHVPSP together: both types
- `vehicleType=VL` filter in GET /api/users returns CHVL only (not CHVPSP)
- `vehicleType=VPSP` returns CHVPSP only; `drivers=true` returns both
- **Désinfection check order**: mission-type vs vehicle-type check (400) happens BEFORE canBorrow permission check (403) in `POST /api/trips`

## INACTIF Redirect
- `src/middleware.ts` uses NextAuth v5 `auth()` wrapper — redirects INACTIF users to `/inactif`
- Exempt paths: `/inactif`, `/login`, `/api/auth`
- `/inactif` page: `src/app/inactif/page.tsx` — client component, shows signOut button
- Migration script: `scripts/rename-guest-to-inactif.ts` — renames GUEST→INACTIF in Turso

## resolveRoles Transition Pattern
- `resolveRoles()` in `api/users/route.ts` and `api/users/[email]/route.ts` handles both `'GUEST'` and `'INACTIF'` as inactive roles
- `'GUEST'` is preserved as-is when stored (not normalized to INACTIF) — DB migration script handles bulk rename
- Once DB migration runs, `'GUEST'` no longer appears in DB

## Test Infrastructure
- **Unit tests**: Vitest + jsdom + @testing-library/react
- **Integration tests**: real SQLite file DB (NOT in-memory) — see integration/setup.ts
- **E2E tests**: Playwright (`npm run test:e2e`, separate from vitest)
- `seedRoles()` defaults include all roles (SECOURISTE, CI/RPAPS, INACTIF/GUEST kept in tests)

### Critical: libSQL `file::memory:` + transactions
- `db.transaction('write')` needs file DB — integration tests use temp file via `mkdtemp`

### Vitest `vi.mock` hoisting
- Factory `() => ({ db })` — `db` undefined at hoist time
- Fix: `async () => { const { db } = await import('./setup'); return { db }; }`

## ESLint Enforcement
- Zero tolerance: `npm run lint` must produce 0 errors AND 0 warnings
- Unused catch: use `catch { }` (empty) instead of `catch (_e) { }`
- `eslint-disable-next-line` must be on the line immediately before the offending code

## User Schema (papiers chauffeurs)
- `papiers_valides INTEGER DEFAULT 1`, `last_validation TEXT`, `start_date_invalidation_process TEXT`
- Driver roles CHVL/CHVPSP subject to license validation
- `GET /api/me/license-check` → `{ validated, daysLeft, blocked }`
- `LicenseBanner` in layout; reservation button checks `licenseBlocked`

## Known Patterns / Gotchas
- Push notification `sendPushNotification` is imported dynamically inside try blocks
- DSA checklist sync belongs in PATCH `/api/vehicles/[id]`, not in GET `/api/vehicles/[id]/checklist`
- Login `callbackUrl` validated: only relative paths starting with `/` but not `//`
- `seedRoles()` in integration tests uses `'GUEST'` (not `'INACTIF'`) — do not change test files
- `GET /api/settings/menus` is ADMIN-only (added role check in v2.3.0 to match test expectations)
