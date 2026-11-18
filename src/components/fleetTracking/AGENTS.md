<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-18 | Updated: 2026-11-18 -->

# Fleet Tracking UI — Suivi technique

## Purpose
UI of the "🔧 Suivi technique" view of `/vehicles`, shown instead of the fleet content when the URL carries `?vue=suivi` (hook `src/app/vehicles/useFleetTrackingView.ts`, toggle `src/app/vehicles/FleetViewToggle.tsx`). Only for `canManageVehicles`, never in Vue DT.

## Key Files
| File | Description |
|------|-------------|
| `tabs.ts` | Sub-tab list and labels (`?onglet=`). Only `contacts` for now |
| `FleetTrackingPanel.tsx` | Sub-tab bar (`.tab-bar` / `.tab-btn`) + active tab |
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
- Tests: `src/__tests__/components/ContactsTab.test.tsx`, `useFleetTrackingView.test.tsx`.
