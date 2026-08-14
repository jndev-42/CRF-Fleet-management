<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Batches

## Purpose
Retrieve and manage individual batch records (lot management). Each batch tracks quantity and optional expiry date. Supports querying batches for an item, deleting batches, and adjusting batch quantities directly. Scoped to user's `ulId`. Read: any authenticated user. Write: ADMIN+ role.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list batches for item), DELETE (delete batch, ADMIN+), PATCH (adjust batch quantity, ADMIN+) |

## For AI Agents

### Working In This Directory
**Roles:** GET requires authentication (401). POST/PATCH/DELETE require ADMIN+ (403).

**GET business rules:**
- Returns batches for single `itemId` (required param)
- Filters to quantity > 0 only
- Sorted by expiry (nulls last), then expiryDate ASC
- Item ownership verified (404 if item not found or user lacks access)

**DELETE business rules:**
- Requires `batchId` (query param)
- Fetches batch to get `itemId` and current `quantity`
- Verifies item ownership (404)
- Deletes batch record
- Decrements `InvItem.quantity` by batch quantity
- Creates log entry with note "Lot périmé supprimé" (assumes deletion is for expired batches)

**PATCH business rules:**
- Adjusts batch quantity by `change` amount (delta, not absolute)
- Validates new quantity >= 0 (400 if would go negative)
- Resynchronizes `InvItem.quantity` to sum of all batches
- Creates log entry with formatted note (e.g. "Ajustement lot (+/-X sur lot YYYY-MM-DD ou stock sans date)")
- Preserves batch's original `expiryDate` (cannot change via PATCH)

**Non-obvious validation:**
- `itemId` (GET) and `batchId` (DELETE/PATCH) must be valid; batch must belong to user's item
- Date formatting in logs: French locale `toLocaleDateString('fr-FR')`
- Change in PATCH is delta, not absolute quantity

**Side effects:**
- DELETE and PATCH both create `InvStockLog` entries
- DELETE and PATCH both update `InvItem.quantity`
- PATCH updates `updatedAt` on batch and item

## Dependencies

### Internal
- Database: `InvItem`, `InvBatch`, `InvStockLog`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
