<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-18 | Updated: 2026-11-18 -->

# Fleet Tracking UI — Suivi technique

## Purpose
UI of the "🔧 Suivi technique" view of `/vehicles`, shown instead of the fleet content when the URL carries `?vue=suivi` (hook `src/app/vehicles/useFleetTrackingView.ts`, toggle `src/app/vehicles/FleetViewToggle.tsx`). Only for `canManageVehicles`, never in Vue DT. URL: `?vue=suivi&onglet=ensemble|taches|dossiers|controles|contacts&tache=<id>&dossier=<id>&filtre=<f>&vehicule=<id>` (`tache` opens the task modal — notification deep link; `dossier` shows a folder's detail instead of the list; `filtre` / `vehicule` are the opening filter set by the overview cards: Contrôles `filtre=to_schedule|soon|…`, Dossiers `filtre=pieces` and/or `vehicule=<vehicleId>` — read once as initial state; removed from the URL by `clearTabFilter` on the first local filter change and on the next tab change; Tâches `filtre=echeance` = `due=soon`). `tache` is also read on `ensemble` (task modal of the overview).

## Key Files
| File | Description |
|------|-------------|
| `tabs.ts` | Sub-tab list and labels (`?onglet=`): `ensemble` (default), `taches`, `dossiers`, `controles`, `contacts`; `FleetTabFilter`, `DOSSIER_MISSING_FILTER` |
| `OverviewTab.tsx` | Screen 1 « Le point sur la flotte »: header with « + Tâche » / « + Nouveau dossier », `OverviewCounters` (4 `stat-card` buttons → filtered tab), `NextActions` / `NextActionRow` (checkbox → Terminé, « Modifier »), `PriorityPanel` (pinned items or fallback, hidden when empty), `OverviewVehicles` (→ Dossiers filtered on the vehicle), « Annuler » toast. Receives the data from the panel |
| `OverviewModals.tsx` | Task modal (create / edit) and new-folder modal opened from the overview; mounted only when open (loads assignees and vehicles then) |
| `useFleetOverview.ts` | Fetch `GET /api/fleet-tracking/overview`, re-read when the panel's `version` changes; stale reads ignored |
| `useCompleteWithUndo.ts` / `UndoToast.tsx` | Check a next action: hide it, PATCH `DONE`, toast « Annuler » for `UNDO_DELAY_MS` (5 s, `pause` / `resume` on hover or user focus; focus moved to « Annuler » on appearance) which PATCHes back the previous state; a failed check or undo shows the row again with a message |
| `overview.module.css` | Overview styles (2 columns → 1 ≤ 900 px) |
| `TasksTab.tsx` | Toolbar, board (4 columns, native pointer drag-and-drop) or list (stacked sections), empty/loading states, task modal (create, or `openTaskId` from the URL) |
| `TasksToolbar.tsx` | Search, vehicle / assignee selects, « Mes tâches », « Épinglées », « Prioritaires », Tableau/Liste toggle (remembered in `localStorage`), « + Tâche » (while a vehicle filter is set, `TasksTab` pre-links the new task to that vehicle) |
| `TaskColumn.tsx` | One state column/section; drop target in board mode; « Terminé » collapsed beyond `DONE_COLLAPSE_LIMIT` (« Afficher les N autres ») |
| `TaskCard.tsx` / `TaskStatusPill.tsx` | Card (links pills, priority, pin, due tone, 📎 count, avatars) and the state pill opening « Déplacer vers… » (bottom sheet ≤ 700 px) — the non-gesture alternative to drag-and-drop |
| `TaskModal.tsx` / `TaskForm.tsx` | Modal shell (loads `GET /tasks/[id]`, focus trap) and the form (state radio buttons, priority, due date, pin, assignees, links, attachments, delete with confirmation) |
| `AssigneePicker.tsx` / `LinkPicker.tsx` / `TaskAttachments.tsx` | Multi-select of assignable managers; single search field for links grouped by type (contacts callable via `tel:`); attachment list/upload/delete (saved immediately, independent of « Enregistrer ») |
| `useFleetTasks.ts` | `useFleetTasks(filters)` (debounced fetch, optimistic state change with rollback + message, `pendingIds` disabling pill/drag during the PATCH, in-flight list reads invalidated then replayed) and `useTaskOptions()` (assignees, all UL vehicles) |
| `tasks.module.css` | Task styles; state colours from DESIGN.md, always paired with the written state |
| `FleetTrackingPanel.tsx` | Sub-tab bar (`.tab-bar` / `.tab-btn`, badges « Tâches » = open tasks and « Dossiers » = open folders, from the overview's `tabCounts`) + active tab; owns `useFleetOverview` and re-reads it when a tab reports a change (`onChanged`) |
| `DossiersTab.tsx` / `DossierListItem.tsx` | Folder list (Ouverts / Clos / Tous + « Pièces à récupérer » (local filter: `missingItemCount > 0`) + vehicle filter, pinned first; opening filter from `initialFilter`), « + Nouveau dossier », or the detail when `?dossier=` is set. `DossierListItem` is reused by the vehicle history |
| `DossierModal.tsx` / `VehicleChecklist.tsx` | Create / edit a folder (title, one or more vehicles as checkboxes with a search above 8 vehicles, description, pin). `initialVehicleIds`: vehicles checked on creation (vehicle filter of the tab, vehicle page); without `vehicles` the modal loads them (`useUlVehicles`). On edit, `vehicleIds` is sent only when the list changed; vehicles that left the UL stay listed so they can be unchecked |
| `DossierDetail.tsx` | Screen 3: `DossierHeader` (state, vehicle, pin, Modifier, Clore / Rouvrir, Supprimer with explicit confirmation), `DossierItems` / `DossierItemRow` (« N sur M manquantes », « + Pièce », « Marquer reçue » with optional value and file — existing folder attachment or a new upload —, undo, remove), `DossierTasks` (tasks of the folder, « + Tâche » pre-filled with the folder and its vehicles), attachments (`TaskAttachments` with `baseUrl`), `DossierLinks` (vehicle cards + objects linked to its tasks) |
| `DossierSelect.tsx` | Folder picker of the task form (open folders; the task's current folder kept even if closed) |
| `useFleetDossiers.ts` | `useDossierList`, `useDossierDetail` (with local `update`), `useOpenDossiers` |
| `dossiers.module.css` | Folder and vehicle-history styles |
| `ControlsTab.tsx` / `ControlsTable.tsx` | Screen 5: filters with counts (Toutes, À dater, Sous 30 jours, Dépassées, RDV fixé — from the API `counts`), table of due controls (vehicle, control, due date + remaining km, appointment or « RDV passé le … », state pill) turned into stacked cards ≤ 720 px; « Fixer un RDV » / « Modifier » |
| `AppointmentModal.tsx` | Appointment date (required, `min`/`max` today → + 5 years), garage among UL + shared contacts, notes ≤ 500, « Créer une tâche » checkbox (replaced by « Tâche liée » when the linked task exists), « Supprimer le rendez-vous » when one exists. On `taskError` it stays open with the message and asks the tab to reload |
| `useFleetControls.ts` | Fetch `GET /api/fleet-tracking/controls` (`controls`, `counts`, `today`); stale reads (errors included) ignored. `ControlsTab` shows « Rendez-vous enregistré · Tâche créée » and calls `onChanged` (panel counters) |
| `controls.module.css` | Controls styles (state colours from `--status-*`, always with the written state) |
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
- Tests: `src/__tests__/components/ContactsTab.test.tsx`, `TasksTab.test.tsx`, `TaskModal.test.tsx`, `useFleetTrackingView.test.tsx`, `FleetTrackingPanel.test.tsx`, `DossierDetail.test.tsx`, `VehicleFleetHistory.test.tsx`, `OverviewTab.test.tsx`.
