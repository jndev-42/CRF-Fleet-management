<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# menus

## Purpose
Menu visibility settings management. SuperAdmin-only endpoints. GET fetches all menu settings (`stats`, `inventory`, `missions` keys with visibility state). Settings stored in `MenuSetting` table and control whether each menu is available, admin-only, or disabled in the UI.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list menu settings) — SuperAdmin only |

## Subdirectories
- `[key]` — PATCH (update visibility for specific menu)

## For AI Agents

### Working In This Directory
**GET** queries `MenuSetting` table and returns array of `{ menu_key, visibility }`. Requires SuperAdmin role. 401 if not auth, 403 if not SuperAdmin.

Valid keys are hardcoded: `stats`, `inventory`, `missions`. Valid visibility values: `available`, `admin_only`, `disabled`.

Fetch all settings on GET; individual settings are updated via PATCH on `[key]`.

## Dependencies

### Internal
- `MenuSetting` table
- `@/lib/roles` — `isSuperAdmin()`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
