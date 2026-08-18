# Lib — Singletons & Integrations

## db.ts
Single exported `db` client. Import it everywhere with `import { db } from '@/lib/db'`.
Never instantiate another client. Never use template literals in SQL — always `{ sql, args }`.

## renault.ts
Gigya → Kamereon auth. Session cached as singleton row in `RenaultSession` table (id=1, always upsert).
Exported function handles re-auth transparently — callers just `await getRenaultVehicleData(vin)`.
Errors are non-fatal in most contexts — wrap calls in try/catch and degrade gracefully.

## onesignal.ts
Targets users by email tag set at device registration.
**Lazy-import** in API routes to avoid penalizing cold starts when push isn't needed:
```ts
const { sendPushNotification } = await import('@/lib/onesignal');
```
Also create a `Notification` DB row alongside every push so the in-app bell shows it.

## drive.ts
Service account auth (not OAuth). Organizes files by trip: each trip gets a Drive folder (`driveFolderId` stored in `Trip` table).
Quota errors are non-fatal — log and continue.

## email.ts
Nodemailer over SMTP. Use for async notifications (reservation approved, etc.).
Non-fatal — always wrap in try/catch, never block the main response on email delivery.

## stats-trips.ts / stats-expenses.ts
Split by domain: trip stats (`buildTripWhere`, `fetchStatsData`) vs expense-report stats (`fetchExpenseStatsData`).
Filtering/aggregation helpers live here and are unit-tested.
If you add a new stats calculation, add it to the matching file and write a unit test.

## previewToken.ts
`isValidPreviewTestToken(authHeader)` — gates the preview-only bearer token used by
automated/pentest tools (see `src/auth.ts`'s `auth()` wrapper). Fail-closed: requires
`isPreview` (from `env.ts`) **and** `process.env.PREVIEW_TEST_TOKEN` to be set. Never
add a code path that accepts this token outside preview.

