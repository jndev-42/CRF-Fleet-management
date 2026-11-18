<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-18 | Updated: 2026-11-18 -->

# Fleet Tracking UI — Suivi technique

## Purpose
UI of the "🔧 Suivi technique" view of `/vehicles`, shown instead of the fleet content when the URL carries `?vue=suivi` (hook `src/app/vehicles/useFleetTrackingView.ts`, toggle `src/app/vehicles/FleetViewToggle.tsx`). Only for `canManageVehicles`, never in Vue DT. URL: `?vue=suivi&onglet=taches|dossiers|contacts&tache=<id>&dossier=<id>` (`tache` opens the task modal — notification deep link; `dossier` shows a folder's detail instead of the list).

## Key Files
| File | Description |
|------|-------------|
| `tabs.ts` | Sub-tab list and labels (`?onglet=`): `taches` (default), `dossiers`, `contacts` |
| `TasksTab.tsx` | Toolbar, board (4 columns, native pointer drag-and-drop) or list (stacked sections), empty/loading states, task modal (create, or `openTaskId` from the URL) |
| `TasksToolbar.tsx` | Search, vehicle / assignee selects, « Mes tâches », « Épinglées », « Prioritaires », Tableau/Liste toggle (remembered in `localStorage`), « + Tâche » |
| `TaskColumn.tsx` | One state column/section; drop target in board mode; « Terminé » collapsed beyond `DONE_COLLAPSE_LIMIT` (« Afficher les N autres ») |
| `TaskCard.tsx` / `TaskStatusPill.tsx` | Card (links pills, priority, pin, due tone, 📎 count, avatars) and the state pill opening « Déplacer vers… » (bottom sheet ≤ 700 px) — the non-gesture alternative to drag-and-drop |
| `TaskModal.tsx` / `TaskForm.tsx` | Modal shell (loads `GET /tasks/[id]`, focus trap) and the form (state radio buttons, priority, due date, pin, assignees, links, attachments, delete with confirmation) |
| `AssigneePicker.tsx` / `LinkPicker.tsx` / `TaskAttachments.tsx` | Multi-select of assignable managers; single search field for links grouped by type (contacts callable via `tel:`); attachment list/upload/delete (saved immediately, independent of « Enregistrer ») |
| `useFleetTasks.ts` | `useFleetTasks(filters)` (debounced fetch, optimistic state change with rollback + message, `pendingIds` disabling pill/drag during the PATCH, in-flight list reads invalidated then replayed) and `useTaskOptions()` (assignees, all UL vehicles) |
| `tasks.module.css` | Task styles; state colours from DESIGN.md, always paired with the written state |
| `FleetTrackingPanel.tsx` | Sub-tab bar (`.tab-bar` / `.tab-btn`, open-folder count badge on « Dossiers ») + active tab |
| `DossiersTab.tsx` / `DossierListItem.tsx` | Folder list (Ouverts / Clos / Tous + vehicle filter, pinned first), « + Nouveau dossier », or the detail when `?dossier=` is set. `DossierListItem` is reused by the vehicle history |
| `DossierModal.tsx` | Create / edit a folder (title, vehicle — or a fixed vehicle from the vehicle page —, description, pin) |
| `DossierDetail.tsx` | Screen 3: `DossierHeader` (state, vehicle, pin, Modifier, Clore / Rouvrir, Supprimer with explicit confirmation), `DossierItems` / `DossierItemRow` (« N sur M manquantes », « + Pièce », « Marquer reçue » with optional value and file — existing folder attachment or a new upload —, undo, remove), `DossierTasks` (tasks of the folder, « + Tâche » pre-filled with the folder and its vehicle), attachments (`TaskAttachments` with `baseUrl`), `DossierLinks` (vehicle card + objects linked to its tasks) |
| `DossierSelect.tsx` | Folder picker of the task form (open folders; the task's current folder kept even if closed) |
| `useFleetDossiers.ts` | `useDossierList`, `useOpenDossierCount` (tab badge), `useDossierDetail` (with local `update`), `useOpenDossiers` |
| `dossiers.module.css` | Folder and vehicle-history styles |
| `ContactsTab.tsx` | Search, category filters, UL contacts (editable, share switch), "Prestataires proposés par d'autres UL" (read-only, hidden when empty), `.vcf` export button (disabled when there is nothing to export), "+ Contact" |
| `ContactCard.tsx` | One contact; without `onEdit` it is read-only (badge « Proposé par l'UL X », lock, no button) |
| `ContactFormModal.tsx` / `PhoneFields.tsx` | Create / edit / delete form (1–5 phones) |
| `useFleetContacts.ts` | Fetch `{ own, shared }`, optimistic share toggle with rollback on error; switch disabled per contact while its PATCH is pending |
| `useModalFocus.ts` | Focus trap + Escape for the modal; initial focus on `[data-autofocus]` |
| `useVCardExport.ts` | Fetches the `.vcf`, downloads it via a blob only on 200, otherwise returns the API error message |
| `filterContacts.ts` | Pure accent-insensitive search + category filter (unit-tested) |
| `fleetTracking.module.css` | Styles (globals.css variables only, light and dark) |

## For AI Agents

### Working In This Directory
- Read-only is decided by the API shape: `shared` contacts are never editable here, and the API answers 403 anyway.
- Phones are `tel:` links (cleaned with `cleanPhoneNumber`); touch targets ≥ 44 px.
- Import types/labels from `@/lib/fleetTracking/contacts` only — never from `access.ts` / `contactsStore.ts` (server only).
- Drag data uses the dedicated MIME type `TASK_DRAG_MIME` (`application/x-fleet-task`); external text drops are ignored.
- `TaskForm` sends `assigneeIds` / `links` in a PATCH only when they changed (no overwrite of a concurrent edit).
- Import task types/labels from `@/lib/fleetTracking/tasks` and `attachments` only (pure modules).
- No activity block on a folder (dropped from the mockup: the audit log is purged after 30 days).
- Tests: `src/__tests__/components/ContactsTab.test.tsx`, `TasksTab.test.tsx`, `TaskModal.test.tsx`, `useFleetTrackingView.test.tsx`, `FleetTrackingPanel.test.tsx`, `DossierDetail.test.tsx`, `VehicleFleetHistory.test.tsx`.
