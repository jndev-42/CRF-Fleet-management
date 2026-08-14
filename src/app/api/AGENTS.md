<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# api

## Purpose
REST API route tree (Next.js Route Handlers). Every route follows a mandatory auth → role → validate → DB → respond order.

## Subdirectories
One directory per resource; see each resource's own `AGENTS.md` for endpoint-specific detail. Nested `[param]` folders are dynamic route segments.
| Directory | Purpose |
|-----------|---------|
| `auth/` | NextAuth handler |
| `banners/` | Communication banners CRUD |
| `bugs/` | Bug report submission |
| `changelog/` | App changelog feed |
| `checklist/` | Vehicle checklist items |
| `cron/` | Vercel cron-triggered jobs |
| `drive/` | Google Drive photo upload/listing proxy |
| `expenses/` | Expense reports |
| `incidents/` | Incident reports |
| `inventory/` | Stock/inventory management |
| `me/` | Current-user endpoints |
| `missions/` | Mission (multi-trip) management |
| `notifications/` | In-app notification bell |
| `qr/` | QR-token vehicle checkin/checkout |
| `renault/` | Renault Connect telemetry proxy |
| `reservations/` | Vehicle reservations |
| `settings/` | App settings/menus config |
| `stats/` | Statistics + CSV/PDF export |
| `trips/` | Trip lifecycle (checkin/checkout) |
| `ul/` | Local unit (Unité Locale) management |
| `users/` | User administration |
| `vcard/` | vCard export |
| `vehicles/` | Vehicle CRUD, metrics, calendar |

## For AI Agents

### Working In This Directory
New API route file → invoke `/api-route-template` skill for the full boilerplate (auth → role → Zod → DB skeleton, transactions, cron, dynamic params).

**Mandatory order (never deviate):**
```
1. await auth()          → 401 if null
2. check roles           → 403 if insufficient
3. await request.json()  → then Zod parse
4. business logic + DB
5. return NextResponse.json(...)
```

### Auth & roles
```ts
const session = await auth();
if (!session?.user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

const roles = session.user.roles || ['GUEST'];
if (!roles.includes('ADMIN')) return NextResponse.json({ error: 'Interdit' }, { status: 403 });
```

### Response format
- Success: `{ success: true }` / `{ success: true, id }` / `{ items: [...] }`
- Error: `{ error: 'French message' }` — never expose stack traces
- Status codes: 200 OK, 201 Created, 400 Bad request, 401 Unauth, 403 Forbidden, 404 Not found, 500 Server error

### Optional integrations — lazy import to avoid cold-start cost
```ts
const { sendPushNotification } = await import('@/lib/onesignal');
```

### Testing Requirements
Every new route needs an integration test covering 401, 403, 400 (Zod), and the happy path — see `src/__tests__/AGENTS.md`.

## Dependencies

### Internal
- `src/auth.ts` — session/auth
- `src/lib/db.ts` — DB client
- `src/lib/*` — onesignal, drive, email, renault integrations

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
