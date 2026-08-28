# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server — auto-starts container DB, seeds with fixture data
npm run dev:prod     # Start dev server — auto-starts container DB, clones prod data
npm run build        # Production build
npm run lint         # ESLint + TypeScript check — must produce 0 errors AND 0 warnings
npm run dev:setup    # Legacy: init local SQLite file (file:./dev.db) with seed data
npm run test         # Run full test suite (Vitest)
npm run db:reset     # Destroy container + data dir — fresh init on next npm run dev
npm run db:stop      # Stop the dev DB container (data persists)

# Useful scripts (run via npx tsx scripts/<name>.ts)
npx tsx scripts/show-schema.ts          # Inspect DB schema
npx tsx scripts/setup-admin.ts <email>  # Promote user to ADMIN
npx tsx scripts/renault-login-test.ts   # Test Renault Connect auth
npx tsx scripts/generate-signing-cert.ts --env preview   # Certificat .p12 de scellement (local | preview | prod ; préfixe le CN)
npx tsx scripts/add-expense-sealed-pdf.ts       # Migration prod : colonnes de scellement des notes de frais
npx tsx scripts/verify-signed-pdf.ts <fichier>  # Vérifie les signatures d'un PDF scellé
npx tsx scripts/backfill-signed-pdfs.ts         # Scelle rétroactivement les notes existantes (dry-run par défaut, --apply pour écrire)
```

## Stack & Key Paths

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Turso (libSQL/SQLite cloud) · NextAuth v5 · Vercel serverless

- `src/app/` — pages and API routes; `src/app/api/` — REST endpoints
- `src/components/` — shared UI; `src/components/vehicle/` — vehicle-specific
- `src/lib/` — singletons (db, renault, onesignal, drive, email)
- `src/auth.ts` — full auth config; `src/proxy.ts` — route protection

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

## Tools

Prefer `mcp__grepai__grepai_search` instead of standard `grep`.
