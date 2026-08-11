<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# banners

## Purpose
Manages communication banners (site-wide announcements). Supports display across pages (ALL, VEHICLES, MISSIONS, INVENTORY), types (info, warning, danger, success), and scoping to specific UL or global. Admins (RESPO, CHVL, CHVPSP) can create/edit banners for their UL; SuperAdmin can create global banners. Standard users fetch active banners for their UL only. Touches `CommunicationBanner` table. Lazy-initializes `link_url` and `link_label` columns on first use.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list with admin override), POST (create) — requires auth; POST requires `canAccessAdminPanel` role |

## Subdirectories
- `[id]` — Update (PATCH) and delete (DELETE) individual banners

## For AI Agents

### Working In This Directory
**GET** returns different data based on `admin=true` query param and user roles:
- Admin mode (requires `canAccessAdminPanel`): SuperAdmin sees all banners; others see only their UL + own non-global banners, with metadata (creator, timestamps).
- Standard mode (all authenticated users): Only active, global or UL-scoped banners, no metadata.

**POST** creates a new banner. SuperAdmin can set `is_global=true`; other admins' banners are tied to their `session.user.ulId`. Non-admin users get 403. Banner creation auto-sets timestamps and creator info.

Zod schema enforces: `message` required, optional title/link_url/link_label, enum types and pages. `ensureBannerColumns()` is called on every request to safely add missing schema columns.

## Dependencies

### Internal
- `CommunicationBanner` table (list, insert, update via PATCH/DELETE routes)
- `UniteLocale` table (LEFT JOIN for ul_name in admin mode)
- `@/lib/roles` — `canAccessAdminPanel()`, `isSuperAdmin()`
- `@/auth` — session, roles

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
