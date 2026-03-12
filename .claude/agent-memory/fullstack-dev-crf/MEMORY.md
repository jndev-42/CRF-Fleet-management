# Agent Memory — cr-chauffeur

## Current Version
- package.json + CHANGELOG.md: **v1.13.0** (as of 2026-03-12)
- Footer version: uses `process.env.NEXT_PUBLIC_APP_VERSION` injected from `package.json` via `next.config.ts` — NOT hardcoded

## Project Structure
- Next.js 16 App Router, React 19, Tailwind CSS, libSQL (`@libsql/client`)
- Auth: `import { auth } from '@/auth'` (server-side), `useSession` / `signOut` from `next-auth/react` (client-side)
- DB: raw SQL via `db.execute()` from `@/lib/db` — no Prisma
- Zod for all API validation

## Key File Paths
- API routes: `src/app/api/`
- Shared modal components: `src/components/vehicle/modals/`
- Renault integration: `src/lib/renault.ts`
- Auth config: `src/auth.ts`
- DB client: `src/lib/db.ts`
- Stats logic: `src/lib/stats.ts` (shared between GET and PDF routes)
- Next config: `next.config.ts`
- Footer version string: `src/components/FooterChangelog.tsx` (hardcoded, must match CHANGELOG)

## Auth Patterns
- Server route auth check: `const session = await auth();` at the very top before any body parsing or DB queries
- 401 for unauthenticated: `!session?.user`
- 403 for insufficient role: `!session?.user?.roles?.includes('ADMIN')`
- Vehicle [id] route uses vehicle **name** as the URL param (not UUID)
- **Exception**: checkin route (`trips/[id]/checkin`) checks auth AFTER the trip lookup — 404 before 401
- `session.user.id` is available (populated from `User.id` via JWT `userId` claim in `src/auth.ts`)
- Auth checks for trip ownership use `session.user.id === trip.driverId` (not email)

## DB Conventions
- Vehicle lookup by name: `WHERE name = ?` (URL param `[id]` is actually the vehicle name)
- Vehicle UUID is stored in `Vehicle.id`, needed for checklist/trip foreign keys
- Checklist DSA item IDs follow pattern: `dsa-checkout-{vehicleUuid}` and `dsa-checkin-{vehicleUuid}`
- Booleans stored as 0/1 integers in SQLite
- **Trip table** uses FK columns `driverId`/`secondDriverId` → `User.id` (no denormalized name/email columns)
- Always JOIN User when fetching trips for display: `JOIN "User" u ON u.id = t.driverId LEFT JOIN "User" u2 ON u2.id = t.secondDriverId`
- Stats queries group by `t.driverId` not by email

## Renault Integration
- `getVinFromName()` is **async** — queries `Vehicle.vin` from DB first, falls back to env vars
- Callers must `await getVinFromName(name)`
- No hardcoded VIN fallback strings — use `RENAULT_VIN_VL186` / `RENAULT_VIN_VL188` env vars only
- `authenticate()` uses DB-backed session cache (`RenaultSession` table, singleton row `id=1`) instead of in-memory variable — survives cold starts across Vercel serverless instances
- DB read/write errors in `authenticate()` are non-fatal: read failure triggers re-auth, write failure is logged and ignored

## Notification URLs
- Always use `encodeURIComponent(vehicleName)` when building URLs with vehicle names
- libSQL row values have type `string | number | bigint | ArrayBuffer` — cast with `String(val)` before `encodeURIComponent`

## Modal Pattern
- Shared modals in `src/components/vehicle/modals/` accept `isOpen`, `onClose`, `onSuccess` props
- `onSuccess` must only be called inside `if (res.ok)` — never optimistically before the API call completes
- `AddVehicleModal` is now a shared component (extracted from page.tsx and vehicles/page.tsx)

## Security Headers
- All 5 headers set in `next.config.ts` via `async headers()` on source `/(.*)`
- No `outputFileTracingIncludes` (project does not use Prisma)

## GuidedTour
- `TourStep.body` is `React.ReactNode` (not `string`) — use JSX, not HTML strings
- No `dangerouslySetInnerHTML` — render `{step.body}` directly

## Next.js Route File Rules
- **Never export non-handler functions from route.ts files** — Next.js only allows `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` exports
- Shared server-side logic must live in `src/lib/*.ts` and be imported by routes

## NextResponse + Binary Data
- `NextResponse` body must be `BodyInit`-compatible — convert Node.js `Buffer` to `Uint8Array`:
  `new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/pdf' } })`

## @react-pdf/renderer (PDF generation)
- Replaced pdfkit as of v1.11.0 — no pdfkit in the project anymore
- Add `@react-pdf/renderer` to `serverExternalPackages` in `next.config.ts`
- PDF document: `src/components/stats/StatsPdfDocument.tsx` — React component using `Document`, `Page`, `View`, `Text`, `Svg` primitives
- Route calls `renderToBuffer(element)` — requires double cast: `as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>`
- Use built-in fonts `Helvetica` and `Helvetica-Bold` — no font registration needed
- `border` shorthand not supported — use `borderBottomWidth`, `borderBottomColor`, `borderBottomStyle`
- Fixed footer: `<View fixed>` with `<Text render={({ pageNumber, totalPages }) => ...} />` for page numbers
- `wrap={false}` on `<View>` prevents it from breaking across pages

## Recharts
- `Defs`, `LinearGradient`, `Stop` are NOT exported from recharts — use inline SVG `<defs>` in JSX instead
- Recharts uses browser APIs — wrap with `dynamic(() => import(...), { ssr: false })` to avoid SSR errors

## Test Infrastructure (added 2026-03-10)
- **Unit tests**: Vitest + jsdom + @testing-library/react + @testing-library/dom
- **Integration tests**: Vitest with file-based temp SQLite DB (NOT in-memory) — see below
- **E2E tests**: Playwright (separate `npm run test:e2e` command, NOT picked up by vitest)
- Config: `vitest.config.ts` excludes `e2e/` folder; `playwright.config.ts` for E2E
- Scripts: `npm test` (vitest run), `npm run test:watch`, `npm run test:e2e`
- Test dirs: `src/__tests__/unit/`, `src/__tests__/components/`, `src/__tests__/integration/`, `e2e/`
- Unit/component setup: `src/__tests__/setup.ts` (in-memory DB, beforeEach drop/recreate)
- Integration setup: `src/__tests__/integration/setup.ts` (temp file DB, beforeEach truncate)

### Trip seed requires User seed first
- `seedTrip` inserts `driverId` FK — libSQL enforces FKs, so a matching User row must exist first
- Always call `seedUser(...)` before `seedTrip(...)` in test `beforeEach` blocks
- Default `seedTrip` uses `driverId: 'user-1'` (unit setup) or `driverId: 'user-driver'` (integration setup)

### Critical: libSQL `file::memory:` does NOT work with `db.transaction('write')`
- `db.transaction('write')` internally opens a second connection
- With `file::memory:`, that second connection sees an **empty database** (separate in-memory instance)
- Integration tests hitting routes that use transactions MUST use a temp file DB (`mkdtemp`)
- Unit/component tests that don't trigger transactions can safely use `file::memory:`

### Vitest `vi.mock` hoisting gotcha
- `vi.mock('@/lib/db', () => ({ db }))` — `db` in the factory is `undefined` (hoisted before imports)
- Fix: `vi.mock('@/lib/db', async () => { const { db } = await import('./setup'); return { db }; })`
- Import test helpers (`db`, `seedVehicle`, etc.) AFTER the `vi.mock` declarations

## Known Patterns / Gotchas
- `vehicles/page.tsx` has its own `isElectric()` helper (name-based, legacy) — `page.tsx` uses `v.vin` to detect connected vehicles
- Push notification `sendPushNotification` is imported dynamically inside try blocks in trips route
- DSA checklist sync belongs in PATCH `/api/vehicles/[id]`, not in GET `/api/vehicles/[id]/checklist`
- Login page `callbackUrl` must be validated: only relative paths starting with `/` but not `//`
