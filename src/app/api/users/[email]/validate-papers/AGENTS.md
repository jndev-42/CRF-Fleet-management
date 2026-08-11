<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users/[email]/validate-papers

## Purpose
Marks a driver's papers as validated, setting `papiers_valides=1`, recording validation date and validator name, and clearing any invalidation-process date. Used when admins approve driver compliance documentation. ADMIN/RESPO access only. Touches `User` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (ADMIN/RESPO) validate driver papers |

## For AI Agents

### Working In This Directory
**PATCH /api/users/[email]/validate-papers** — ADMIN/RESPO only. Marks papers valid for the user. Sets `papiers_valides=1`, `last_validation` to today (YYYY-MM-DD), `start_date_invalidation_process` to NULL, `validated_by` to session user's name or email. Returns `{ success: true, last_validation, validated_by }`. User must exist (404 if not found).

**Key business rules:**
- Email parameter is from `[email]` route segment (not a URL query)
- `last_validation` is today's date in YYYY-MM-DD format
- `validated_by` captures validator identity for audit
- Clears invalidation process start date (resets any prior expiry timer)

## Dependencies

### Internal
- `@/lib/db` — direct SQL update to `User` table
- `@/lib/roles` — `canAccessAdminPanel`
- `@/auth` — NextAuth v5 session for `user.name` and `user.email`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
