<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-09-18 -->

# missions

## Purpose
Mission report list (`/missions`) — the index of *comptes rendus de mission* filed after RESEAU / DPS / PAPS operations. Two views: **« Mes rapports »** (default, every report the viewer filed, across all ULs and DTs) and **« Tous les rapports »** (reports of the currently active UL, managers only). The table shows date, mission type badge, mission name + submitter, location, the **« Interventions »** count (still the `victim_count` field — only the column header was renamed), the **UL/DT attachment tag**, and a critical-incident flag. Reserved for admins, read-only managers (Président/Cadre), and the `CI/RPAPS` role.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Client page — role gate, scope tabs, type filter bar, data fetching. |
| `MissionsTable.tsx` | Co-located table component + the `MissionReport` type and the UL/DT `AttachmentTag`. |
| `missions.module.css` | **CSS Module** for the table, type badges (`typeRESEAU`/`typeDPS`/`typePAPS`), attachment tag, incident badge, and empty state. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `[id]/` | Single mission report detail view (see `[id]/AGENTS.md`) |
| `new/` | Mission report creation wizard (see `new/AGENTS.md`) |

## For AI Agents

### Working In This Directory
**Access gate:** `canAccess = isAdminOrAbove(roles) || isReadOnlyManager(roles) || roles.includes('CI/RPAPS')` — so SUPER_ADMIN, ADMIN, PRESIDENT, CADRE, and CI/RPAPS. Everyone else is pushed to `/vehicles` (not `/`) by a `useEffect`. **Creation** is narrower: `canCreate = isAdminOrAbove(roles) || roles.includes('CI/RPAPS')` — Président/Cadre can read but not file reports, so the "Nouveau compte rendu" button is hidden for them in both the header and the empty state.

**Scope tabs:** `scope` state (`'mine' | 'all'`) drives the `scope` query param. The tab strip is rendered only when `canSeeAll = isAdminOrAbove(roles) || isReadOnlyManager(roles)`; the API enforces the same rule with a 403, so hiding the tab is convenience, not security. « Tous les rapports » follows the **active UL** picked in the Navbar switcher (`session.user.ulId`) and is labelled with its name — changing the active UL changes the list. Reports attached to a DT never appear there; they are reachable only through « Mes rapports » of their author.

Data flow: `fetchReports()` calls `GET /api/missions?limit=50&scope=…` plus an optional `type` param, and stores `data.reports` / `data.total`. The fetch effect re-runs on `typeFilter` **and** `scope` change; the `exhaustive-deps` disable is deliberate because `fetchReports` is recreated every render.

The UL/DT column renders `ul_name` or `dt_code` straight from the API — never the viewer's own UL. Exactly one of the two is non-null per row; `AttachmentTag` falls back to `—` if both are null (legacy rows).

Filter bar uses global `filter-btn` classes with a hardcoded `['RESEAU', 'DPS', 'PAPS']` tuple, labelled through `MISSION_TYPE_LABELS` from `@/lib/mission-supplies`. The "Tous" button shows `total` from the API, which is the unfiltered count **for the current scope**.

`hasIncidents(r)` is the OR of `had_acr`, `had_hemorrhage`, `had_complex_care`; `needs_followup` only appends a " Suivi" label inside that badge, it does not raise the flag on its own.

This directory is an exception to the global "pages use global CSS classes" rule — the table styling lives in `missions.module.css`. Keep new table styling there rather than adding global classes.

## Dependencies

### Internal
- `@/lib/roles` — `isAdminOrAbove`, `isReadOnlyManager`
- `@/lib/mission-supplies` — `MISSION_TYPE_LABELS`
- `GET /api/missions?limit=&type=&scope=` — returns `{ reports, total }`
- Navigates to `/missions/new` and `/missions/{id}`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
