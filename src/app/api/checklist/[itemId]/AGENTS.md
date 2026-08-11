<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [itemId]

## Purpose
Update or delete individual vehicle checklist items. PATCH modifies label, required status, or display order; DELETE removes the item. Admin-only endpoint. DSA items (prefixed `dsa-`) are protected: labels cannot be changed, required status cannot be disabled, and deletion is blocked. Touches `VehicleChecklistItem` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (update item), DELETE (remove item) — requires ADMIN role; DSA items have special protections |

## For AI Agents

### Working In This Directory
**PATCH** accepts optional fields `label`, `required`, `order`. Special rules:
- DSA items: label updates blocked with 400; required status cannot be set to false (400 error).
- Other items: all fields are updatable.
- If no fields provided, returns 400.

**DELETE** removes the item. DSA items cannot be deleted; returns 400 with message to disable it in vehicle settings instead. Non-DSA items are deleted unconditionally if user is admin.

Both methods auth-check: only `isAdminOrAbove()` allowed; 403 if not admin. 404 returns if item not found (for PATCH/DELETE).

## Dependencies

### Internal
- `VehicleChecklistItem` table (select, update, delete)
- `@/lib/roles` — `isAdminOrAbove()`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
