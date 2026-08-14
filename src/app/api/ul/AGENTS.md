<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# ul

## Purpose
Unité Locale (UL) management. GET fetches all ULs (organizational units, e.g., Paris 18, Lyon, Marseille) for authenticated users. POST creates a new UL with name, slug, phone numbers, parking spots, and custom stamp image. SuperAdmin-only for POST. Touches `UniteLocale` table. Each UL has a unique slug, phone contact list, default parking spots, and an optional stamp image (auto-compressed).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list all ULs, auth required), POST (create UL, SuperAdmin only) |

## Subdirectories
- `[id]` — DELETE (remove UL), PATCH (update UL metadata)

## For AI Agents

### Working In This Directory
**GET** requires auth only; all authenticated users can list ULs. Returns array of UL objects with phoneNumbers and defaultParkingSpots parsed from JSON columns.

**POST** SuperAdmin only (403 otherwise). Creates new UL with auto-generated ID (`ul-{slug}`). Zod schema enforces: name/slug required, slug must be lowercase alphanumeric+hyphens, phoneNumbers array of `{ label, number }`, optional stampImage and dtCode. Validates uniqueness of name and slug (409 if duplicate). Compresses stamp image via `compressStampImage()` before storing.

## Dependencies

### Internal
- `UniteLocale` table
- `@/lib/stamp` — `compressStampImage()`
- `@/lib/roles` — `isSuperAdmin()`
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
