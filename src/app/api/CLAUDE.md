# API Routes

For full boilerplate (auth → role → Zod → DB skeleton, transactions, cron, dynamic params), invoke the `/api-route-template` skill.

## Mandatory order (never deviate)
```
1. await auth()          → 401 if null
2. check roles           → 403 if insufficient
3. await request.json()  → then Zod parse
4. business logic + DB
5. return NextResponse.json(...)
```

## Auth & roles
```ts
const session = await auth();
if (!session?.user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

const roles = session.user.roles || ['GUEST'];
if (!roles.includes('ADMIN')) return NextResponse.json({ error: 'Interdit' }, { status: 403 });
```

## Response format
- Success: `{ success: true }` / `{ success: true, id }` / `{ items: [...] }`
- Error: `{ error: 'French message' }` — never expose stack traces
- Status codes: 200 OK, 201 Created, 400 Bad request, 401 Unauth, 403 Forbidden, 404 Not found, 500 Server error

## Optional integrations — lazy import to avoid cold-start cost
```ts
const { sendPushNotification } = await import('@/lib/onesignal');
```

## Preview test token (headless auth for automated/pentest tools)
In **preview only**, `await auth()` (exported from `src/auth.ts`) also accepts
`Authorization: Bearer $PREVIEW_TEST_TOKEN` and resolves it to a real session
for the fixed `preview-chvl@preview.local` account (see `src/lib/previewToken.ts`).
Fail-closed by design: requires `NEXT_PUBLIC_APP_ENV=preview` (hard-coded gate,
dead in production even if the secret leaks) **and** `PREVIEW_TEST_TOKEN` to be
set — unlike the `CRON_SECRET` check (`src/app/api/cron/`), which fails open
when unset. No route code changes are needed to support it; it's invisible to
business logic. No UI/cookie session is created — API access only.
