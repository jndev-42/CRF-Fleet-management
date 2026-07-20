# /api-route-template

Boilerplate patterns for new API routes in `src/app/api/`.

## Full route skeleton
```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const Schema = z.object({
  field: z.string(),
});

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // 2. Roles
  const roles = session.user.roles || ['GUEST'];
  if (!roles.includes('ADMIN')) return NextResponse.json({ error: 'Interdit' }, { status: 403 });

  // 3. Zod — catch separately
  let data: z.infer<typeof Schema>;
  try {
    data = Schema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  // 4. Business logic + DB
  await db.execute({ sql: 'INSERT INTO ...', args: [...] });

  // 5. Response
  return NextResponse.json({ success: true }, { status: 201 });
}
```

## Dynamic params — always await
```ts
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ...
}
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

## Cron routes — protect with CRON_SECRET
```ts
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// ...
export const maxDuration = 30; // for long-running routes
```

## Optional integrations — lazy import to avoid cold-start cost
```ts
const { sendPushNotification } = await import('@/lib/onesignal');
```

## Response format
- Success: `{ success: true }` / `{ success: true, id }` / `{ items: [...] }`
- Error: `{ error: 'French message' }` — never expose stack traces
- Status codes: 200 OK, 201 Created, 400 Bad request, 401 Unauth, 403 Forbidden, 404 Not found, 500 Server error
