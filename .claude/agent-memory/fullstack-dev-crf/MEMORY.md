# Agent Memory — cr-chauffeur

## Current Version
- CHANGELOG.md and FooterChangelog.tsx: **v1.9.2** (as of 2026-03-08)

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
- Next config: `next.config.ts`
- Footer version string: `src/components/FooterChangelog.tsx` (hardcoded, must match CHANGELOG)

## Auth Patterns
- Server route auth check: `const session = await auth();` at the very top before any body parsing or DB queries
- 401 for unauthenticated: `!session?.user`
- 403 for insufficient role: `!session?.user?.roles?.includes('ADMIN')`
- Vehicle [id] route uses vehicle **name** as the URL param (not UUID)

## DB Conventions
- Vehicle lookup by name: `WHERE name = ?` (URL param `[id]` is actually the vehicle name)
- Vehicle UUID is stored in `Vehicle.id`, needed for checklist/trip foreign keys
- Checklist DSA item IDs follow pattern: `dsa-checkout-{vehicleUuid}` and `dsa-checkin-{vehicleUuid}`
- Booleans stored as 0/1 integers in SQLite

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

## Known Patterns / Gotchas
- `vehicles/page.tsx` has its own `isElectric()` helper (name-based, legacy) — `page.tsx` uses `v.vin` to detect connected vehicles
- Push notification `sendPushNotification` is imported dynamically inside try blocks in trips route
- DSA checklist sync belongs in PATCH `/api/vehicles/[id]`, not in GET `/api/vehicles/[id]/checklist`
- Login page `callbackUrl` must be validated: only relative paths starting with `/` but not `//`
