<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users/[email]/ul

## Purpose
Manages a user's local unit (UL) assignments and UL-scoped roles. Supports single-assignment operations (add/remove UL) and bulk synchronization of all UL memberships. Enforces scope: local admins can only manage their own UL. Touches `UserUL` and `UniteLocale` tables; syncs global `UserRole` when home UL changes.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (ADMIN/RESPO) fetch user's ULs; PATCH (ADMIN) add/remove single UL; PUT (ADMIN) bulk sync all ULs |

## For AI Agents

### Working In This Directory
**GET /api/users/[email]/ul** — ADMIN/RESPO only. Returns user's UL memberships with roles per UL. Response maps `is_home: 1|0` to `isHome` boolean; roles are split from comma-separated string.

**PATCH /api/users/[email]/ul** — ADMIN/RESPO only. Single UL operation: `action: 'add'|'remove'`, `ulId`, `isHome` boolean. If adding with `isHome=true`, removes prior home UL. If removing home UL, just deletes the link. Local admins restricted to their own UL. Returns `{ success: true }`.

**PUT /api/users/[email]/ul** — ADMIN/RESPO only. Bulk synchronize all UL assignments in one request. Payload: `{ uls: [ { ulId, isHome, roles: [...] }, ... ] }`. Local admins cannot modify other ULs (merges keep other UL entries intact, only modifies their own). Syncs global `UserRole` table if updating home UL. Returns `{ success: true }`.

**Key business rules:**
- `isHome = 1` = user's primary UL; user can have at most one
- When `isHome` changes for home UL, global `UserRole` syncs with home UL's roles
- Local admin cannot change another UL's home assignment if user belongs there
- Driver role in any UL triggers paper invalidation (if never validated)
- Email parameter is URL-decoded; UL validation checks existence in `UniteLocale`

## Dependencies

### Internal
- `@/lib/db` — `UserUL`, `UniteLocale`, `UserRole` tables
- `@/lib/roles` — `canAccessAdminPanel`, `isAdminOrAbove`, `isSuperAdmin`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
