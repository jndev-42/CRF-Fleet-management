<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# missions

## Purpose
Mission report list (`/missions`) — the index of *comptes rendus de mission* filed after RESEAU / DPS / PAPS operations. Shows a table of up to 50 recent reports with date, mission type badge, mission name + submitter, location, victim count, whether UL 18 was present, and a critical-incident flag. Reserved for admins, read-only managers (Président/Cadre), and the `CI/RPAPS` role.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Client page — role gate, type filter bar, report table. |
| `missions.module.css` | **CSS Module** for the table, type badges (`typeRESEAU`/`typeDPS`/`typePAPS`), incident badge, and empty state. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `[id]/` | Single mission report detail view (see `[id]/AGENTS.md`) |
| `new/` | Mission report creation wizard (see `new/AGENTS.md`) |

## For AI Agents

### Working In This Directory
**Access gate:** `canAccess = isAdminOrAbove(roles) || isReadOnlyManager(roles) || roles.includes('CI/RPAPS')` — so SUPER_ADMIN, ADMIN, PRESIDENT, CADRE, and CI/RPAPS. Everyone else is pushed to `/vehicles` (not `/`) by a `useEffect`. **Creation** is narrower: `canCreate = isAdminOrAbove(roles) || roles.includes('CI/RPAPS')` — Président/Cadre can read but not file reports, so the "Nouveau compte rendu" button is hidden for them in both the header and the empty state.

Data flow: `fetchReports()` calls `GET /api/missions?limit=50` plus an optional `type` param, and stores `data.reports` / `data.total`. The fetch effect re-runs on `typeFilter` change; the `exhaustive-deps` disable is deliberate because `fetchReports` is recreated every render.

Filter bar uses global `filter-btn` classes with a hardcoded `['RESEAU', 'DPS', 'PAPS']` tuple, labelled through `MISSION_TYPE_LABELS` from `@/lib/mission-supplies`. The "Tous" button shows `total` from the API, which is the unfiltered count.

`hasIncidents(r)` is the OR of `had_acr`, `had_hemorrhage`, `had_complex_care`; `needs_followup` only appends a " Suivi" label inside that badge, it does not raise the flag on its own.

This directory is an exception to the global "pages use global CSS classes" rule — the table styling lives in `missions.module.css`. Keep new table styling there rather than adding global classes.

## Dependencies

### Internal
- `@/lib/roles` — `isAdminOrAbove`, `isReadOnlyManager`
- `@/lib/mission-supplies` — `MISSION_TYPE_LABELS`
- `GET /api/missions?limit=&type=` — returns `{ reports, total }`
- Navigates to `/missions/new` and `/missions/{id}`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
