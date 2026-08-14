<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users

## Purpose
User-administration UI extracted from the users page. Currently a single component: the collapsible role reference shown above the user table. The interactive user management itself lives in `src/components/admin/UsersTab.tsx`, which imports from here.

## Key Files
| File | Description |
|------|-------------|
| `RoleLegend.tsx` | Collapsible "Légende des rôles" panel. Renders one card per role from a module-level `ROLE_DESCRIPTIONS` array — label, colour, one-line description, and a bulleted permission list — in a responsive auto-fit grid. Local `open` boolean is its only state. |

## For AI Agents

### Working In This Directory
`RoleLegend` takes **no props** and fetches nothing — it is a static reference rendered by `admin/UsersTab.tsx:695`.

**`ROLE_DESCRIPTIONS` is documentation, not enforcement.** The nine entries (`SUPER_ADMIN`, `ADMIN`, `PRESIDENT`, `TRESORIER`, `CADRE`, `CI/RPAPS`, `CHVPSP`, `CHVL`, `INACTIF`) describe what each role may do; the actual checks live in `@/lib/roles` and the API routes. When a role's permissions change in code, update the matching `permissions` array here or the legend silently lies to users. Note `INACTIF` is documented as incompatible with every other role.

**This file is the canonical role colour palette.** Each entry carries `color`, `bgColor` (8% alpha), and `borderColor` (25–35% alpha) — the same triplet used for role badges in `UsersTab`. Reuse these values rather than picking new ones for role-coloured UI elsewhere.

Styling is entirely inline (structural values plus `var(--text-secondary)`, `var(--text-muted)`, `var(--radius-sm)`) — there is no `.module.css` here. Icons are emoji (ℹ️ ▶) rather than `lucide-react`, predating the icon convention; prefer `lucide-react` for anything new. All text French.

This directory is a natural home for further slices extracted out of the oversized `admin/UsersTab.tsx` (user row, user table, add-user modal) under the Carpaccio rule.

## Dependencies

### Internal
- `@/components/admin/UsersTab` — sole consumer
- Conceptually mirrors `@/lib/roles` (`isSuperAdmin`, `isAdminOrAbove`, …) and the role checks in `src/app/api/users/*`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
