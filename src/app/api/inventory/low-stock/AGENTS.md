<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Low Stock

## Purpose
Query items below their minimum stock threshold. Returns items where `quantity < minStock` and `minStock IS NOT NULL`. Supports filtering by stockId. Used for alerts and restocking workflows. Read-only, any authenticated user.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list items below minimum stock) |

## For AI Agents

### Working In This Directory
**Role:** Any authenticated user (401 if not). No role restrictions.

**Business rules:**
- Returns only items with `minStock IS NOT NULL` (null minStock = no alert threshold)
- Filters to `quantity < minStock` (strictly less than)
- Scoped to user's `ulId`
- Optional `stockId` filter (query param) narrows to single stock container
- Sorted by `(minStock - quantity) DESC` (greatest deficit first), then by name ASC
- Response includes: ID, name, category, quantity, minStock

**Non-obvious validation:**
- Items without minStock set are excluded entirely
- Calculation is simple: quantity < minStock
- No expiry filtering (separate from expiring-soon)

**Side effects:**
- None (read-only)

## Dependencies

### Internal
- Database: `InvItem`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
