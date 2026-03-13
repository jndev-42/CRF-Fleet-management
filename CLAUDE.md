# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint + TypeScript check — must produce 0 errors AND 0 warnings
npm run dev:setup    # Initialize local SQLite DB with seed data (idempotent)
npm run test         # Run full test suite (Vitest)

# Useful scripts (run via npx tsx scripts/<name>.ts)
npx tsx scripts/show-schema.ts          # Inspect DB schema
npx tsx scripts/setup-admin.ts <email>  # Promote user to ADMIN
npx tsx scripts/renault-login-test.ts   # Test Renault Connect auth
```

## Stack & Key Paths

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Turso (libSQL/SQLite cloud) · NextAuth v5 · Vercel serverless

- `src/app/` — pages and API routes; `src/app/api/` — REST endpoints
- `src/components/` — shared UI; `src/components/vehicle/` — vehicle-specific
- `src/lib/` — singletons (db, renault, onesignal, drive, email)
- `src/auth.ts` — full auth config; `src/middleware.ts` — route protection

**Database:** Direct SQL via `@libsql/client` — no ORM. Always parameterized: `{ sql: "... WHERE id = ?", args: [id] }`.

**Auth:** Production = Google OAuth2 (`@croix-rouge.fr`). Dev = credentials (`@dev.local`). Roles in JWT.

**Roles & access:** ADMIN > RESPO > CHVL > CHVPSP > GUEST. Enforced in API routes and UI via `session.user.roles`.

**Styling:** CSS Modules per component + global CSS variables in `app/globals.css`. `next-themes` for dark/light.

**Deployment:** Vercel (auto-deploy on `main`). DB: Turso cloud. Uses `--webpack` (not Turbopack).

## Testing

**Rule: every new feature must ship with tests.**
- New API route → integration test: 401, 403, 400 (Zod), happy path
- New lib module → unit tests for all exported functions
- New React component with state/logic → React Testing Library component test

See `src/__tests__/CLAUDE.md` for mocking patterns and request factory.

## Local dev setup

See `/dev-setup` skill or run `npm run dev:setup` then `npm run dev`.

## M-4 (deferred)

Pages are Client Components with `useEffect` data fetching — Server Component migration planned but not started. Don't convert yet.
