<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users

## Purpose
Manages user accounts, roles, and local unit (UL) assignments. Provides endpoints to list all users with optional role/vehicle-type filtering, create new users with initial roles, and bulk manage role assignments. All operations require ADMIN or RESPO authorization. Touches `User`, `UserRole`, `Role`, and `UserUL` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (ADMIN/RESPO) list users with optional filters; POST (ADMIN) create user with roles |

## Subdirectories
- `[email]` — User-specific operations (role updates, deletion)
- `[email]/ul` — Local unit assignments for a user
- `[email]/validate-papers` — Mark driver papers as validated

## For AI Agents

### Working In This Directory
**GET /api/users** — ADMIN or RESPO required. Returns all users with combined global + UL-home roles, optional filtering by `drivers=true` or `vehicleType=VPSP|VL`. Auto-seeds system roles into `Role` table. Response includes `availableRoles` list.

**POST /api/users** — ADMIN only. Creates new user with email, name, optional initial roles and UL assignment. Automatically sets `papiers_valides=0` and `start_date_invalidation_process` for new driver-role users. Returns `{ success: true, id, ulName }`.

**Key business rules:**
- Local admins (RESPO without SUPER_ADMIN) can only create/manage users in their own UL
- Driver role assignment (`CHVL`, `CHVPSP`) triggers paper invalidation if papers were never validated
- All role assignments are resolved via `resolveRoles()` function to handle composite roles
- User email is unique; attempted duplicates return 409

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL via `@libsql/client`
- `@/lib/roles` — `isAdminOrAbove`, `canAccessAdminPanel`, `resolveRoles`, `isSuperAdmin`, `MANAGEABLE_ROLES`
- `@/auth` — NextAuth v5 session extraction

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
