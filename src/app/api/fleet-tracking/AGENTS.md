<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-18 | Updated: 2026-11-18 -->

# fleet-tracking

## Purpose
API of the "🔧 Suivi technique" view of `/vehicles` (spec `_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md`). Every route goes through `requireFleetManager()` (`src/lib/fleetTracking/access.ts`): 401 without session, 403 without `canManageVehicles` (INACTIF included), 400 without an active UL. The UL is always the session's; ownership uses `ownsResource()` (strict equality, a SUPER_ADMIN acts as a manager of their active UL).

## Subdirectories
| Path | Methods | Notes |
|------|---------|-------|
| `contacts/` | GET `{own, shared}`, POST | Provider directory; `shared` contacts of other ULs are read-only |
| `contacts/[id]/` | PATCH, DELETE | Owner UL only (403 otherwise) |
| `contacts/vcard/` | GET | `.vcf` export (own + shared) |
| `tasks/` | GET (filters `vehicle`, `assignee=me\|<id>`, `pinned=1`, `priority`, `status=A,B`, `q`), POST | Enriched tasks (assignees, resolved links, attachment count) |
| `tasks/[id]/` | GET (with `attachments`), PATCH (partial; `assigneeIds` / `links` replace the lists), DELETE | Other UL → 403. `completedAt` set on DONE, cleared on reopen |
| `tasks/[id]/attachments/` | POST multipart `file` | At most 20 per task (400), PDF/JPEG/PNG/WebP by magic bytes, ≤ 4 MB (413), R2 `fleet-tracking/<UL>/tasks/<taskId>/` then DB (R2 cleaned if the insert fails) |
| `tasks/[id]/attachments/[attachmentId]/` | GET (`inline`, `?download=1`, sandbox CSP), DELETE | Other UL → 403; row deleted first, then R2 best-effort (failure logged) |
| `assignees/` | GET | Active members of the UL whose roles **in that UL** (same cascade as the session, `computeSessionRoles`) satisfy `canManageVehicles` |
| `link-targets/` | GET `?type=VEHICLE\|CONTACT\|INCIDENT\|MAINTENANCE&q=` | Targets visible from the UL (incidents/maintenances via `Vehicle.ulId`; contacts own + shared). Without `type`: all four types |

## For AI Agents

### Working In This Directory
- Writes are wrapped in `withAudit`; any added/renamed route needs `npm run mcp:catalog`.
- Assignment notifications go through `notifyNewAssignees()` (`src/lib/fleetTracking/taskGuards.ts`): only newly added assignees, never the author, deep link `/vehicles?vue=suivi&onglet=taches&tache=<id>`.
- On PATCH, assignees and links **already on the task** are accepted without re-validation (the client resends full lists; a contact may have been unshared since). New ones are validated against the UL scope → 400.
- Attachments write to R2 only through `src/lib/r2.ts` (demo writes land under `demo/`), so these routes do not belong in `DEMO_EXTERNAL_WRITE_ROUTES`.
- Tests: `src/__tests__/integration/fleet-tracking-contacts.test.ts`, `fleet-tracking-tasks.test.ts`, `fleet-tracking-tasks-attachments.test.ts` (node environment, in-memory R2).
