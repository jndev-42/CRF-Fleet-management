# API Routes

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

## Zod — catch separately
```ts
try {
  const data = Schema.parse(await request.json());
} catch (e) {
  if (e instanceof z.ZodError)
    return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
  return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
}
```

## Dynamic params — always await
```ts
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
```

## Transactions — explicit commit/rollback
```ts
const tx = await db.transaction('write');
try {
  await tx.execute({ sql: '...', args: [...] });
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
}
```

## Response format
- Success: `{ success: true }` / `{ success: true, id }` / `{ items: [...] }`
- Error: `{ error: 'French message' }` — never expose stack traces
- Status codes: 200 OK, 201 Created, 400 Bad request, 401 Unauth, 403 Forbidden, 404 Not found, 500 Server error

## Optional integrations — lazy import to avoid cold-start cost
```ts
const { sendPushNotification } = await import('@/lib/onesignal');
```

## Cron routes — protect with CRON_SECRET
```ts
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```
Add `export const maxDuration = 30;` for long-running routes.
