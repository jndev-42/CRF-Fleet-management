# CR Chauffeur — Audit Agent Memory

## Project Identity
- App: CR Chauffeur v1.5.0 — Fleet management for Croix-Rouge Paris 18e
- Stack: Next.js 16 (App Router), React 19, NextAuth v5 beta, Turso/libSQL (raw SQL), Zod, Tailwind CSS, Vercel
- Roles: ADMIN, CHVL, CHVPSP, RESPO, GUEST
- Deployment: Vercel. Cron job at /api/cron/daily-mileage-check

## Architecture Patterns
- Auth: NextAuth v5 Google OAuth only. Email domain restriction to @croix-rouge.fr in signIn callback.
- DB: Raw SQL via @libsql/client (Turso). No ORM. Parameterised queries throughout (safe from SQLi).
- Vehicle [id] param is actually the vehicle NAME not UUID (lookup by name, then use UUID internally).
- JWT callback fetches roles from DB on every token refresh — not cached separately.
- Drive integration: Service account via OAuth2 refresh token (GOOGLE_DRIVE_REFRESH_TOKEN env var).
- Renault API: Module-level session cache (cachedSession) — risky in serverless (not persistent across cold starts).
- Push notifications: OneSignal + in-app Notification table in DB. sendPushNotification also writes DB rows.

## Critical Security Issues Found (Audit March 2026)
1. `GET /api/vehicles` — NO auth check. Returns all vehicles incl. VINs, plates, notes to unauthenticated users.
2. `POST /api/vehicles` — NO auth check. Any unauthenticated user can create vehicles.
3. `GET /api/vehicles/[id]` — NO auth check. Returns full trip history incl. driverEmail.
4. `POST /api/trips` — Auth check happens AFTER DB read. Unauthenticated POST possible (returns 403 only if no session, but after vehicle fetch).
5. `GET /api/renault/[vin]` — NO auth check. Exposes Renault API to public.
6. `GET /api/changelog` — NO auth check (acceptable, low risk).
7. VINs hardcoded as fallback in src/lib/renault.ts lines 5-6 — real vehicle VINs in source code.
8. CRON_SECRET check is optional (if env not set, route is publicly callable).
9. `dangerouslySetInnerHTML` used in GuidedTour.tsx lines 394 and 437 — but body content is hardcoded, not user-controlled.
10. Google Drive folder ID hardcoded in drive/upload/route.ts line 6.
11. No security headers in next.config.ts (no CSP, no X-Frame-Options, etc.).
12. Middleware excludes ALL /api/* routes — no automatic JWT protection for API layer.
13. `GET /api/users` — only checks session exists, not ADMIN role. Any authenticated user gets full user list.

## Medium Issues Found
- `any` casts: error handlers use `error: any` in drive routes, checkin, checkout modals.
- `as any` cast in auth.ts line 102 (session return with error).
- Duplicate AddVehicleModal in both page.tsx and vehicles/page.tsx (code duplication).
- Optimistic UI in CheckOutModal calls onSuccess() BEFORE API responds — if checkout fails silently, vehicle stays locked.
- No file type/MIME server-side validation in drive/upload/route.ts (only client-side).
- No total upload size limit enforced server-side.
- `window.location.href = '/api/auth/signout'` in Navbar — should use signOut() from next-auth/react for CSRF-safe signout.
- useSession() dependency missing in useEffect in vehicles/page.tsx line 64.
- JWT roles fetched from DB on every request (no TTL optimisation).

## Conventions
- API routes use NextResponse.json. All mutations have Zod validation.
- Transactions used correctly for multi-step writes.
- Error messages in French for user-facing APIs.
- Components use default exports.
- 'use client' directive used on all interactive pages (everything is client-side rendered).

See: patterns.md for detailed fix examples.
