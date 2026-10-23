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

**POST /api/users** — ADMIN only. Creates new user with email, name, optional initial roles and UL assignment. Always sets `papiers_valides=0` and `start_date_invalidation_process` to today, whatever the initial roles. Returns `{ success: true, id, ulName }`.

**Key business rules:**
- The user list (`GET /api/users`) stays complete for `canAccessAdminPanel` callers — user decision of 2026-10-23. Creation, roles, UL assignment and deletion are limited to the actor's UL for local admins (ADMIN without SUPER_ADMIN), under the existing rules of `route.ts`, `[email]/route.ts` and `[email]/ul/route.ts`. `validate-papers` requires the target to be a member of the actor's active UL, or to have no UL at all (see its AGENTS.md)
- Driver role assignment (`CHVL`, `CHVPSP`) triggers paper invalidation if papers were never validated. This is only the trigger: the papers check itself applies to every account that borrows a vehicle (`canBorrowVehicles` in `@/lib/licenseStatus` for display, the server guard for anyone who borrows)
- `POST` always inserts the `UserUL` row with `is_home = 1`, so it can never produce a non-conforming row (INACTIF outside the home UL). Conformance by construction, pinned by a test rather than left accidental
- All role assignments are normalised through `resolveRoles()`, which **preserves** INACTIF alongside active roles (it only maps the legacy `GUEST` to `INACTIF` and de-duplicates). Storage records what the administrator ticked; the runtime predicates (`isInactive`, `isQrBlocked`) derive the block from it, so unticking INACTIF restores the active roles without re-entering them.
- User email is unique; attempted duplicates return 409

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL via `@libsql/client`
- `@/lib/roles` — `isAdminOrAbove`, `canAccessAdminPanel`, `resolveRoles`, `isSuperAdmin`, `MANAGEABLE_ROLES`
- `@/auth` — NextAuth v5 session extraction

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
