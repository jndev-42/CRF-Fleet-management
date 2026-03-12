# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint + TypeScript check — must produce 0 errors AND 0 warnings
npm run dev:setup    # Initialize local SQLite DB with seed data (idempotent)

# Useful scripts (run via npx tsx scripts/<name>.ts)
npx tsx scripts/show-schema.ts          # Inspect DB schema
npx tsx scripts/setup-admin.ts <email>  # Promote user to ADMIN
npx tsx scripts/renault-login-test.ts   # Test Renault Connect auth
```

## Local Dev Setup

Minimum `.env.local`:
```env
AUTH_SECRET=any_random_string
TURSO_DATABASE_URL=file:./dev.db
TURSO_AUTH_TOKEN=
```

After `.env.local` is in place: `npm run dev:setup` then `npm run dev`. The login page shows a **"Mode développement"** panel with one-click login for 4 roles (ADMIN, RESPO/Responsable, CHVL/Chauffeur, GUEST) — no Google OAuth needed.

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Turso (libSQL/SQLite cloud) · NextAuth v5 · Vercel serverless

**Routing:**
- `src/app/` — pages and API routes (App Router)
- `src/app/api/` — all REST endpoints as serverless functions
- `src/components/` — shared UI; `src/components/vehicle/` — vehicle-specific; modals in `src/components/vehicle/modals/`
- `src/lib/` — singletons (db, renault, onesignal, drive, email)

**Pages are currently Client Components** (`'use client'`) that fetch data via `useEffect`, resulting in skeleton loaders on every navigation. Migrating them to async Server Components is planned but not yet done (see memory M-4).

**Database:** Direct SQL via `@libsql/client` — no ORM/Prisma. All queries must use parameterized form:
```typescript
await db.execute({ sql: "SELECT * FROM Vehicle WHERE id = ?", args: [id] });
// NEVER: `SELECT * FROM Vehicle WHERE id = ${id}`
```

**Auth (NextAuth v5):**
- Production: Google OAuth2, restricted to `@croix-rouge.fr` domain. First login auto-creates user with `GUEST` role.
- Dev: Credentials provider with hardcoded test accounts (`@dev.local` domain).
- Roles (`ADMIN`, `RESPO`, `CHVL`, `CHVPSP`, `GUEST`) stored in JWT, fetched from DB in `jwt` callback.
- `src/auth.ts` — full config; `src/auth.config.ts` — Edge-safe subset for middleware; `src/middleware.ts` — route protection.

**API Route Convention:**
1. Always check session first: `const session = await auth(); if (!session) return 401`
2. Verify role server-side before any sensitive operation
3. Validate request bodies with Zod
4. All SQL queries parameterized

**Key integrations:**
- **Renault Connect** (`src/lib/renault.ts`): Gigya auth → Kamereon vehicle data. Session cached in `RenaultSession` table to survive cold starts.
- **OneSignal** (`src/lib/onesignal.ts`): Push notifications, role-based targeting via tags.
- **Google Drive** (`src/lib/drive.ts`): Trip document storage.

**Roles & access:** ADMIN > RESPO > CHVL (chauffeur) > CHVPSP > GUEST. Enforced in both API routes and UI conditionals on `session.user.roles`.

**Styling:** CSS Modules per component + global CSS variables in `app/globals.css` for theming. `next-themes` for dark/light persistence.

**Deployment:** Vercel (auto-deploy on `main` push). DB: Turso cloud. Uses `--webpack` (not Turbopack) in both dev and build.

## Testing

**Stack:** Vitest + React Testing Library (jsdom). Run with `npm run test`.

**Structure:**
- `src/__tests__/unit/` — pure functions, no DB, no network
- `src/__tests__/components/` — React Testing Library, no DB
- `src/__tests__/integration/` — real SQLite DB (via `./setup.ts`), mocked auth + external services

**Rule: every new feature must ship with tests.** For each feature:
- New API route → integration test covering 401, 403, 400 (Zod), and the happy path
- New lib module → unit tests covering all exported functions
- New React component with state/logic → component test via React Testing Library

See `src/__tests__/CLAUDE.md` for mocking patterns, auth mock setup, and request factory.

## Lint Enforcement

**Zero-tolerance policy:** `npm run lint` must produce **0 errors and 0 warnings** at all times.

**Pre-commit hook (Husky + lint-staged):** Every commit automatically runs ESLint with `--max-warnings=0` on all staged `.ts`/`.tsx` files. A commit that introduces lint issues will be rejected.

**When adding `any`:** Always use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>` with a mandatory justification comment. Prefer typed alternatives:
- Catch blocks: use `catch (e: unknown)` + `e instanceof Error ? e.message : String(e)`
- API response shapes: use typed interfaces or `Record<string, unknown>`
- Use `src/lib/utils/error.ts` `getErrorMessage(e)` for consistent error message extraction

**React hooks rules:**
- `react-hooks/exhaustive-deps` disables require a comment explaining why the dep is intentionally omitted
- `react-hooks/set-state-in-effect` disables are only allowed for SSR hydration guards
- Prefer wrapping callbacks in `useCallback` over disabling the rule

**Next.js rules:**
- Always use `<Link>` from `next/link` instead of `<a>` for internal navigation
- Always use `<Image>` from `next/image` instead of `<img>` for static assets
- Dynamic/proxy image URLs (e.g. `/api/drive/photos/...`) may use `<img>` with an `eslint-disable` comment
