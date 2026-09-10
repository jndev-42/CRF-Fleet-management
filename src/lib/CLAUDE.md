# Lib — Singletons & Integrations

## db.ts
Single exported `db` client. Import it everywhere with `import { db } from '@/lib/db'`.
Never instantiate another client. Never use template literals in SQL — always `{ sql, args }`.

## renault.ts
**Pure fetch client — knows nothing about the domain.** Gigya → Kamereon auth from a
`ConnectionContext` (declared here, imported by `vehicle-connection.ts` — never the reverse).
Reads no account credentials from the environment: only `GIGYA_API_KEY`, a public brand constant.
Sessions are cached per `credentialId` — module-level `Map` + a `RenaultSession` row upserted with
`ON CONFLICT(credentialId) WHERE credentialId IS NOT NULL`. That write is the only one this module
performs, and it is non-fatal.
**Never add a status write here.** Error classification is strict and load-bearing:
`BrandAuthError` **only** on `errorCode !== 0`; missing personId/JWT/MYRENAULT account, network
failures and 5xx are `BrandTransientError`, which must never change a status — otherwise a Renault
outage turns the whole fleet red. `VinNotOnAccountError` (cockpit 404) is vehicle-specific.
Errors are non-fatal in most contexts — wrap calls in try/catch and degrade gracefully.

## vehicle-connection.ts
Resolution + business side effects, and the **only** layer allowed to write `VehicleConnection.status`.
`getRenaultVehicleData(vehicleId)` takes the vehicle **UUID**, never a VIN and never a name.
`resolveVehicleConnection(vehicleId)` joins `VehicleConnection` → `BrandCredential`, decrypts the
password in memory (never logged) and rewraps opportunistically — a failed rewrap is non-fatal.
Status is written at **credential grain** (`WHERE credentialId = ?`, never `WHERE vehicleId = ?`):
the credential is what breaks, so all its vehicles flip together. The write itself is non-fatal.
`isConnectedInDb(vehicleId)` is the **server** predicate (`status IN ('CONNECTED','ERROR')`); its
client mirror is `isVehicleConnected(vehicle)` in `src/app/vehicles/[id]/utils.ts`. This module
imports `@/lib/db` — importing it from a Client Component would pull `@libsql/client` into the browser bundle.
Callers that loop over the fleet (the cron) must create a `failedCredentials` Set **per run** and pass
it in: at module level it would survive on a warm lambda and keep a credential blocked after the
password was fixed.
`VehicleNotConnectedError` is a normal business state — a 400, never a 500.

## crypto.ts
AES-256-GCM for `BrandCredential.passwordEncrypted`. Format frozen by the spec: exactly
`iv:authTag:ciphertext`, three non-empty base64 segments, no key-id and no version — a corrupted
ciphertext and one wrapped with the previous key are therefore indistinguishable, which is why every
fallback onto `_PREVIOUS` is logged.
`encryptSecret` / `decryptSecret` / `needsRewrap(payload)` / `keyFingerprint()`.
The key is read **inside** the functions, never at module load: `next build` imports modules without
runtime secrets, and a throw at load time would break the build.
Decryption tries at most two keys — `CREDENTIALS_ENCRYPTION_KEY`, then
`CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` when declared. There is no plaintext fallback: a lost key means
the credentials must be re-entered.
Rotation exit mechanism is `scripts/rewrap-credentials.ts --apply`, **not** the opportunistic rewrap
in `vehicle-connection.ts`, which only touches credentials that happen to be read.
**Never log plaintext, key, or ciphertext.**

## brands.ts
Supported-brand registry (`BRANDS`, `Brand`, `BRAND_LABELS`, `isBrand`). **Import-free on purpose** —
it is read by both server routes (Zod enums) and Client Components (brand `<select>`).

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
