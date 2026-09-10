<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# lib

## Purpose
Singleton service clients and integration wrappers — DB, auth-adjacent role helpers, and third-party integrations (Renault Connect, OneSignal, Google Drive, email).

## Key Files
| File | Description |
|------|-------------|
| `db.ts` | Single exported `db` client (`@libsql/client`). Import everywhere via `import { db } from '@/lib/db'` — never instantiate another client |
| `renault.ts` | Pure fetch client for Renault Connect (Gigya → Kamereon). Takes a `ConnectionContext` (declared here), reads no account credentials from the environment, writes **no** status. Sessions cached per `credentialId` (module `Map` + `RenaultSession` upsert). Typed errors: `BrandAuthError`, `BrandTransientError`, `VinNotOnAccountError` |
| `vehicle-connection.ts` | Resolves a vehicle's connection and owns every `VehicleConnection.status` write. `getRenaultVehicleData(vehicleId)` (**UUID**, never a VIN), `resolveVehicleConnection`, `isConnectedInDb`, `VehicleNotConnectedError`. Server-only — imports `@/lib/db` |
| `brands.ts` | Supported-brand registry (`BRANDS`, `Brand`, `BRAND_LABELS`, `isBrand`). Import-free so both server routes and Client Components can use it |
| `crypto.ts` | AES-256-GCM for `BrandCredential.passwordEncrypted` (`iv:authTag:ciphertext`). `encryptSecret`, `decryptSecret`, `needsRewrap`, `keyFingerprint`. Key read inside the functions, never at module load |
| `onesignal.ts` | Push notifications, targets users by email tag. Lazy-import in API routes to avoid cold-start cost. Also create a `Notification` DB row alongside every push |
| `drive.ts` | Google Drive service-account auth. Each trip gets a Drive folder (`driveFolderId` in `Trip` table). Quota errors are non-fatal |
| `email.ts` | Nodemailer/SMTP for async notifications. Non-fatal — wrap in try/catch, never block main response |
| `stats.ts` | Pure computation functions — no DB, no side effects. Unit-tested |
| `roles.ts` | Role hierarchy/permission helpers |
| `env.ts` | Environment variable access/validation |
| `imageCompression.ts` | Client-side photo compression before upload |
| `maintenanceUtils.ts` | Maintenance schedule/threshold helpers |
| `mission-supplies.ts` | Mission supply-list logic |
| `bugReportLogger.ts` | Bug report persistence |
| `preview-accounts.ts` | Demo/preview account seeding helpers |
| `stamp.ts` | PDF stamping/signature helpers |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `contexts/` | React context providers (see `contexts/AGENTS.md`) |
| `demo/` | Demo-mode data/logic (see `demo/AGENTS.md`) |
| `inventory/` | Inventory domain logic (see `inventory/AGENTS.md`) |
| `utils/` | Generic utility functions (see `utils/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **db.ts**: never use template literals in SQL — always `{ sql, args }` parameterized queries.
- **renault.ts**: errors are non-fatal in most contexts — wrap calls in try/catch and degrade gracefully. Never add a domain write (status, `Vehicle`, …) to this module — it is imported by seven routes including a cron, and the `src/lib/CLAUDE.md` contract depends on it staying a fetch client. `BrandAuthError` is raised **only** on `errorCode !== 0`; everything else is transient and must not change any status.
- **vehicle-connection.ts**: `getRenaultVehicleData` takes the vehicle **UUID**. Status writes are at credential grain (`WHERE credentialId = ?`) and are non-fatal (log `[vehicle-connection] …`, never throw). A caller that iterates the fleet creates its own `failedCredentials` Set per run — never at module level. Do **not** import this module from a Client Component.
- **crypto.ts**: never log plaintext, key, or ciphertext; a decryption fallback onto `_PREVIOUS` is always logged so corruption stays visible.
- **onesignal.ts**: lazy-import (`await import('@/lib/onesignal')`) in API routes.
- **stats.ts**: if you add a new stats calculation, add it here and write a unit test (not inline in a component).
- Catch blocks: use `catch (e: unknown)` + `getErrorMessage(e)` from `src/lib/utils/error.ts`.

### Testing Requirements
New lib module → unit tests for all exported functions.

## Dependencies

### External
- `@libsql/client`, `googleapis`, `@remscodes/renault-api`, `react-onesignal` (server-side send), `nodemailer`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
