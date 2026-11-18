<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-18 | Updated: 2026-11-18 -->

# Fleet Tracking — Suivi technique de la flotte

## Purpose
Server-side and shared logic of the "🔧 Suivi technique" view of `/vehicles` (v5.55.0, `_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md`): provider contacts directory per UL (CAP-1/2/3) tasks with assignees, links and attachments (CAP-4/5/6/7/12), and folders (« dossiers ») with items to collect, attachments and the vehicle history (CAP-7/8/9/13). Inspections and the overview will be added here.

## Key Files
| File | Description |
|------|-------------|
| `schema.ts` | Shared DDL (`FLEET_TRACKING_DDL`, `FLEET_TRACKING_TABLES`, `FLEET_TRACKING_INDEX_NAMES`) — `FleetContact`, `FleetTask` (with nullable `dossierId` for deliverable 3), `FleetTaskAssignee`, `FleetTaskLink`, `FleetAttachment` (generic owner TASK \| DOSSIER), `FleetDossier`, `FleetDossierItem` — run by the prod migration `scripts/add-fleet-tracking.ts`, `scripts/setup-dev.ts` and the integration test setup |
| `access.ts` | `requireFleetManager()` (401 / 403 `canManageVehicles` / 400 no active UL), `ownsResource()`, `activeUlId()`, `parseBody()` — **server only** (imports `@/auth`) |
| `contacts.ts` | **Pure** (client-safe): categories + labels, Zod schemas (`.strict()`), `FleetContact` type, vCard 3.0 generator with RFC 2426 escaping |
| `contactsStore.ts` | DB access for `FleetContact` (list own + shared with `ulName`, get, create, partial update, delete) — **server only** |
| `tasks.ts` | **Pure** (client-safe): states/priorities/link types + French labels, Zod schemas (`.strict()`), filter schema, types (`FleetTask`, `TaskLink`, `TaskAttachment`, `AssignableManager`…), column ordering, due-date tone, deep link |
| `attachments.ts` | **Pure** (client-safe): magic-byte detection (PDF/JPEG/PNG/WebP), 4 MB limit, file-name sanitizing (real extension), `Content-Disposition`, R2 key `fleet-tracking/<UL>/tasks/<taskId>/<id>.<ext>` |
| `tasksStore.ts` | DB access for tasks: assignable managers (`computeSessionRoles` per member in the UL), scoped link validation and label resolution, filtered list with batch enrichment, create/update (one `write` batch), delete (DB first in one batch, R2 keys captured with `RETURNING`, then R2 best-effort, failures logged), attachment rows — **server only** |
| `dossiers.ts` | **Pure** (client-safe): states OPEN/CLOSED + labels, Zod schemas (dossier, item, filters), types (`FleetDossier` with counters, `DossierItem`, `FleetDossierDetail`, `VehicleHistoryEntry`), `missingItemsLabel` (« 1 sur 2 manquantes »), `dossierSummary`, `compareDossiers`, `dossierDeepLink` |
| `dossiersStore.ts` | DB access for folders: list with counters (sub-queries), detail (items, tasks via `listTasks({ dossier })`, attachments), create/update (`closedAt` set on close, cleared on reopen), delete (one batch: folder, items, attachments `RETURNING r2Key`, tasks **detached** `dossierId = NULL`; then R2 best-effort), items CRUD (receiving sets date + author, unchecking clears value, file, date and author), vehicle history — **server only** |
| `dossierGuards.ts` | `loadOwnedDossier()` (404 / 403 other UL) and `checkTaskDossier()` (400 for a folder outside the task's UL) — **server only** |
| `attachmentRoutes.ts` | Route bodies shared by task and folder attachments: `handleAttachmentUpload()` (per-owner cap, 413, magic bytes, R2 then DB with cleanup) and `serveAttachment()` (inline / download, sandbox CSP) — **server only** |
| `taskGuards.ts` | `checkTaskTargets()` (400 on out-of-scope assignee/link) and `notifyNewAssignees()` (lazy `@/lib/push`, never throws) — **server only** |

## For AI Agents

### Working In This Directory
- The UL is **always** `session.user.ulId` (via `requireFleetManager`), never a client value. Schemas are `.strict()`: an extra `ulId` field is a 400.
- Ownership: `ownsResource()` = `!isOutsideUl(...) && resourceUlId === sessionUlId`. The extra equality is deliberate — `isOutsideUl` exempts SUPER_ADMIN, but in this module a SUPER_ADMIN acts as a manager of their active UL and cannot edit another UL's contact.
- Only cross-UL exception: read and export of **shared** contacts (and linking a shared contact to a task). Never copy a shared contact into the local directory; never let anything else (tasks, folders, attachments) cross ULs.
- Link labels are resolved **in the UL scope**: a target no longer visible (vehicle moved, contact unshared, row deleted) comes back as `missing: true` with a generic label and no phone.
- `IncidentReport` and `VehicleMaintenance` have no `ulId`: always join `Vehicle`.
- `updateContactSchema` keeps absent fields absent (`emptyToNull` returns `undefined` for `undefined`): a partial PATCH must never blank `email`/`address`/`notes`.
- A folder's vehicle must belong to the session UL (400 otherwise) and is **immutable** after creation (`vehicleId` in PATCH → 400). A task newly put into a folder (create, or a different `dossierId`) needs an OPEN folder of the same UL (400); the unchanged current folder is accepted even if closed. Entering a folder adds the folder's vehicle link (`withDossierVehicleLink`: if absent, still in the UL, and under `MAX_TASK_LINKS`). Deleting a folder never deletes its tasks.
- An item's `attachmentId` must be an attachment **of that folder** (400; also enforced inside the UPDATE); deleting that attachment clears it on the item (same transaction), the item stays received.
- No activity log on folders (the audit log is purged after 30 days).
- Every write route is wrapped in `withAudit`; any new route requires `npm run mcp:catalog`.
- Adding a table: append its DDL to `FLEET_TRACKING_DDL` and its name to `FLEET_TRACKING_TABLES`, add a `DELETE FROM` in `truncateTables()` of `src/__tests__/integration/setup.ts`, and extend `scripts/add-fleet-tracking.ts` checks if needed.

## Dependencies

### Internal
- `@/lib/db`, `@/auth`, `@/lib/roles` (`canManageVehicles`), `@/lib/apiAuth` (`isOutsideUl`, 401/403 responses)
