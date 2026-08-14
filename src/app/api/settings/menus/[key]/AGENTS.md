<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [key]

## Purpose
PATCH endpoint to update menu visibility for a specific menu key. SuperAdmin-only. Validates key against allowed list (`stats`, `inventory`, `missions`). Updates `MenuSetting.visibility` to one of `available`, `admin_only`, `disabled`. Touches `MenuSetting` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (update menu visibility) — SuperAdmin only, validates key and visibility enum |

## For AI Agents

### Working In This Directory
**PATCH** takes a JSON body with `visibility` field. Flow:
1. Auth check; 401 if not authenticated.
2. Role check: SuperAdmin only; 403 if not SuperAdmin.
3. Validate key from path params against `['stats', 'inventory', 'missions']`; return 400 if invalid.
4. Parse body with Zod schema (visibility enum: `available | admin_only | disabled`); return 400 with details if invalid.
5. Update `MenuSetting` where `menu_key = key`, set `visibility` and `updatedAt`.
6. Return 200 with `{ success: true }`.

## Dependencies

### Internal
- `MenuSetting` table (update)
- `@/lib/roles` — `isSuperAdmin()`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
