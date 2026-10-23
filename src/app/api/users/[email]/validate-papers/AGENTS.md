<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users/[email]/validate-papers

## Purpose
Marks a user's papers as validated (any account that borrows a vehicle — not only drivers), setting `papiers_valides=1`, recording validation date and validator name, and clearing any invalidation-process date. Used when admins approve compliance documentation. Requires `canAccessAdminPanel` (SUPER_ADMIN, ADMIN, PRESIDENT, CADRE) and, outside SUPER_ADMIN, that the target be a member of the actor's active UL. Touches `User` table, reads `UserUL`.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (`canAccessAdminPanel` + UL membership) validate a user's papers |

## For AI Agents

### Working In This Directory
**PATCH /api/users/[email]/validate-papers** — `canAccessAdminPanel` only (SUPER_ADMIN, ADMIN, PRESIDENT, CADRE). Marks papers valid for the user. Sets `papiers_valides=1`, `last_validation` to today (YYYY-MM-DD), `start_date_invalidation_process` to NULL, `validated_by` to session user's name or email. Returns `{ success: true, last_validation, validated_by }`. User must exist (404 if not found). Self-validation → 403, whatever the role.

**Key business rules:**
- The `[email]` route segment actually carries the **user id**, not an email
- **UL membership guard** (outside SUPER_ADMIN), after the self-validation check and before the UPDATE: one query checks whether the target has any `UserUL` row and whether it has one for `session.user.ulId` (home or secondary). Target with UL rows but none in the actor's active UL → **404**, indistinguishable from an unknown id, nothing written. A session without UL (absent or `'default'`) only validates accounts that have no UL at all. A target with no `UserUL` row stays validatable by any manager. Tests: `src/__tests__/integration/licenseCheck.test.ts` (« 12. Cloisonnement UL »)
- `GET /api/users` stays unfiltered: managers still see every account; only this write is UL-scoped
- `last_validation` is today's date in YYYY-MM-DD format
- `validated_by` captures validator identity for audit
- Clears invalidation process start date (resets any prior expiry timer)

## Dependencies

### Internal
- `@/lib/db` — direct SQL update to `User` table, membership read on `UserUL`
- `@/lib/roles` — `canAccessAdminPanel`, `isSuperAdmin`
- `@/auth` — NextAuth v5 session for `user.name` and `user.email`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
