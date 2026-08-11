<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Update or delete individual ULs. PATCH modifies UL metadata (name, slug, contacts, parking, stamp image, DT code); DELETE removes the UL. Permissions: SuperAdmin can edit/delete any UL; local admins (ADMIN/RESPO in their own UL) can only PATCH their own UL. Touches `UniteLocale` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (remove UL, SuperAdmin only), PATCH (update UL, SuperAdmin or local admin) |

## For AI Agents

### Working In This Directory
**DELETE** SuperAdmin only; 403 otherwise. Returns 404 if UL not found, 200 with `{ success: true }` on delete.

**PATCH** allows both SuperAdmin and local admins (admin in their own UL): 
- SuperAdmin can edit any UL.
- Local admin (checked via `isAdminOrAbove(roles) && id === session?.user?.ulId`) can only edit their own.
- Non-admin users get 403.

Body accepts optional fields: `name`, `slug`, `phoneNumbers` (array), `defaultParkingSpots` (array), `stampImage` (string, auto-compressed), `dtCode` (string). Each field is updated separately via direct SQL UPDATE if provided. No fields = 400.

Stamp image compression via `compressStampImage()` if provided.

## Dependencies

### Internal
- `UniteLocale` table (select, update, delete)
- `@/lib/stamp` — `compressStampImage()`
- `@/lib/roles` — `isSuperAdmin()`, `isAdminOrAbove()`
- `@/auth` — session, ulId

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
