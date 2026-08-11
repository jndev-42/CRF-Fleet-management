<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users/[email]

## Purpose
User-specific endpoints for role management and deletion. Allows ADMIN to update a user's global roles and delete inactive users (preserving those with mission history). Enforces UL scope for local administrators. Touches `User`, `UserRole`, `Trip`, and `mission_reports` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (ADMIN) update user roles; DELETE (ADMIN) remove user if no mission history |

## Subdirectories
- `ul` — Manage this user's UL assignments and roles
- `validate-papers` — Mark this user's driver papers as valid

## For AI Agents

### Working In This Directory
**PATCH /api/users/[email]** — ADMIN only. Updates user's global roles. Validates that actor can assign each role (SUPER_ADMIN restriction). If user is now a driver, invalidates papers (if never validated). Local admins cannot modify users from other ULs. Email parameter is URL-decoded. Returns `{ success: true }`.

**DELETE /api/users/[email]** — ADMIN only. Deletes a user only if they have no mission reports (to preserve history). Local admins can only delete users in their own UL. Nullifies `driverId` and `secondDriverId` in `Trip` records and `driver_id` in `mission_reports`. Returns `{ success: true }` or 409 if user has submitted reports.

**Key business rules:**
- Email is URL-decoded; handles special characters in email addresses
- Role assignment triggers paper invalidation for new drivers only if `last_validation IS NULL`
- Cannot delete users with mission history (preserve audit trail)
- Local admin scope strictly enforced via home UL (`is_home = 1`) check

## Dependencies

### Internal
- `@/lib/db` — transaction support for role updates
- `@/lib/roles` — `isAdminOrAbove`, `canAssignRole`, `resolveRoles`, `isSuperAdmin`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
