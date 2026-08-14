<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# lib

## Purpose
Singleton service clients and integration wrappers — DB, auth-adjacent role helpers, and third-party integrations (Renault Connect, OneSignal, Google Drive, email).

## Key Files
| File | Description |
|------|-------------|
| `db.ts` | Single exported `db` client (`@libsql/client`). Import everywhere via `import { db } from '@/lib/db'` — never instantiate another client |
| `renault.ts` | Gigya → Kamereon auth for Renault Connect. Session cached as singleton row in `RenaultSession` table (id=1, always upsert). `await getRenaultVehicleData(vin)` handles re-auth transparently |
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
- **renault.ts**: errors are non-fatal in most contexts — wrap calls in try/catch and degrade gracefully.
- **onesignal.ts**: lazy-import (`await import('@/lib/onesignal')`) in API routes.
- **stats.ts**: if you add a new stats calculation, add it here and write a unit test (not inline in a component).
- Catch blocks: use `catch (e: unknown)` + `getErrorMessage(e)` from `src/lib/utils/error.ts`.

### Testing Requirements
New lib module → unit tests for all exported functions.

## Dependencies

### External
- `@libsql/client`, `googleapis`, `@remscodes/renault-api`, `react-onesignal` (server-side send), `nodemailer`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
