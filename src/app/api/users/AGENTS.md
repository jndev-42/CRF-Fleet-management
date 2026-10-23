<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users

## Purpose
Manages user accounts, roles, and local unit (UL) assignments. Provides endpoints to list all users with optional role/vehicle-type filtering, create new users with initial roles, and bulk manage role assignments. GET requires `canAccessAdminPanel` (SUPER_ADMIN, ADMIN, PRESIDENT, CADRE); POST requires `isAdminOrAbove`. Touches `User`, `UserRole`, `Role`, and `UserUL` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (`canAccessAdminPanel`) list users with optional filters; POST (ADMIN) create user with roles |

## Subdirectories
- `[email]` — User-specific operations (role updates, deletion)
- `[email]/ul` — Local unit assignments for a user
- `[email]/validate-papers` — Mark driver papers as validated

## For AI Agents

### Working In This Directory
**GET /api/users** — `canAccessAdminPanel` required (SUPER_ADMIN, ADMIN, PRESIDENT, CADRE). Returns all users with combined global + UL-home roles, optional filtering by `drivers=true` or `vehicleType=VPSP|VL`. Fleet managers without admin-panel access (`canManageVehicles || canManageReservations`, i.e. RESP_VEHICULE) may call it **only** with one of these filters: they get `{ users: [{ id, name, email }] }` restricted to drivers of the session UL (empty without a session UL); unfiltered → 403. Désinfection-responsable pickers use the dedicated `…/desinf-responsables` routes instead. Auto-seeds system roles into `Role` table. Response includes `availableRoles` list.

**POST /api/users** — ADMIN only. Creates new user with email, name, optional initial roles and UL assignment. Automatically sets `papiers_valides=0` and `start_date_invalidation_process` for new driver-role users. Returns `{ success: true, id, ulName }`.

**Key business rules:**
- Local admins (ADMIN without SUPER_ADMIN) can only create/manage users in their own UL
- Driver role assignment (`CHVL`, `CHVPSP`) triggers paper invalidation if papers were never validated
- `POST` always inserts the `UserUL` row with `is_home = 1`, so it can never produce a non-conforming row (INACTIF outside the home UL). Conformance by construction, pinned by a test rather than left accidental
- All role assignments are normalised through `resolveRoles()`, which **preserves** INACTIF alongside active roles (it only maps the legacy `GUEST` to `INACTIF` and de-duplicates). Storage records what the administrator ticked; the runtime predicates (`isInactive`, `isQrBlocked`) derive the block from it, so unticking INACTIF restores the active roles without re-entering them.
- User email is unique; attempted duplicates return 409

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL via `@libsql/client`
- `@/lib/roles` — `isAdminOrAbove`, `canAccessAdminPanel`, `resolveRoles`, `isSuperAdmin`, `MANAGEABLE_ROLES`
- `@/auth` — NextAuth v5 session extraction

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
