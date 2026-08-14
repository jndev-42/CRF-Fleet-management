<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Expiring Soon

## Purpose
Query inventory items expiring within the next 30 days. Returns batch details (ID, quantity, expiry date) joined with item metadata (name, category). Supports filtering by stockId. Read-only, any authenticated user.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list items expiring within 1 month) |

## For AI Agents

### Working In This Directory
**Role:** Any authenticated user (401 if not). No role restrictions.

**Business rules:**
- Cutoff: today + 30 days (calculated as `oneMonthFromNow.setMonth(getMonth() + 1)`)
- Returns batches where `expiryDate <= limitDate` AND `quantity > 0`
- Scoped to user's `ulId`
- Optional `stockId` filter (query param) narrows to single stock container
- Sorted by `expiryDate ASC` (earliest expiry first)
- Joins `InvBatch` with `InvItem` to provide item name and category alongside batch data

**Non-obvious validation:**
- Null expiryDate batches excluded (expiryDate IS NOT NULL)
- Calculation uses ISO date format (YYYY-MM-DD)
- Response includes both batch fields (ID, quantity, expiryDate) and item fields (ID, name, category)

**Side effects:**
- None (read-only)

## Dependencies

### Internal
- Database: `InvBatch`, `InvItem`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
