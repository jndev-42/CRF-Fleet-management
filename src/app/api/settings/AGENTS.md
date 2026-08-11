<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# settings

## Purpose
Admin settings management. Currently includes menu visibility settings (`stats`, `inventory`, `missions`). SuperAdmin-only resource. Allows toggling menus between `available`, `admin_only`, and `disabled` states. Touches `MenuSetting` table. Planned future use for feature flags, theme settings, and other global app settings.

## Subdirectories
- `menus` — GET (list menu settings), PATCH (update menu visibility)

## For AI Agents

### Working In This Directory
Container directory for settings endpoints. All routes require authentication and SuperAdmin role check. If adding new settings (feature flags, theme, etc.), follow this pattern: SuperAdmin check, then query/update the relevant settings table. Consider using a generic settings table or separate tables per feature area.

## Dependencies

### Internal
- `MenuSetting` table
- `@/lib/roles` — `isSuperAdmin()`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
