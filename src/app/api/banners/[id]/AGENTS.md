<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Update or delete individual banners. PATCH edits banner metadata (title, message, type, page target, visibility, links); DELETE removes a banner. Admin panel access required (RESPO and above). Non-SuperAdmin admins can only modify banners belonging to their UL or created by them. Touches `CommunicationBanner` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (update), DELETE (delete) — requires auth and `canAccessAdminPanel` role; ownership/UL checks enforce scope |

## For AI Agents

### Working In This Directory
**PATCH** updates banner fields (all optional). Ownership check: SuperAdmin can edit any banner; non-SuperAdmin can only edit banners in their UL or created by them. Non-SuperAdmin cannot set `is_global=true`. If making a banner global, its `ul_id` is cleared; otherwise respects the provided `ul_id` or defaults to user's `ulId`.

**DELETE** removes the banner. Same ownership check as PATCH applies. Returns 404 if banner not found, 403 if no permission.

Zod schema allows all fields optional (updateBannerSchema). Validation errors (bad enum, non-string message) return 400 with details.

## Dependencies

### Internal
- `CommunicationBanner` table (select, update, delete)
- `@/lib/roles` — `canAccessAdminPanel()`, `isSuperAdmin()`
- `@/auth` — session, roles, ulId

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
