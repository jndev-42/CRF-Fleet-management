<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory Adjust

## Purpose
Adjust inventory quantities at the batch level with FEFO (First Expiry First Out) withdrawal logic. Handles stock additions (create/update batches), removals (FEFO-ordered deduction), and optional batch splitting. Scoped to user's `ulId`. Requires ADMIN+ role.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST (adjust quantity with batch management, ADMIN+) |

## For AI Agents

### Working In This Directory
**Role:** ADMIN+ only. Authenticated user required (401). Insufficient role → 403.

**Core business rules:**
- `change` can be positive (add stock) or negative (remove stock)
- **Positive (addition):**
  - Optional `deductFromNoDate` flag: if set with `expiryDate`, deduct from no-expiry batch and add specified quantity to new/existing batch (batch splitting)
  - If no matching batch exists, create new batch with specified expiryDate
  - If batch exists with same expiryDate, increment it
- **Negative (removal):**
  - FEFO order: expired batches first, then by expiryDate ASC, nulls (no date) last
  - Deduct from earliest-expiring batches until `change` quantity satisfied
  - Can result in partial batch depletion or complete batch zeroing
- Always updates `InvItem.quantity` to sum of all non-zero batches afterward
- Log created for every adjustment (auditing)

**Non-obvious validation:**
- `itemId` must belong to user's `ulId` (404 if not found or access denied)
- Negative `change` with insufficient stock doesn't fail — just deducts what's available (verify this behavior)
- `deductFromNoDate` is only meaningful with positive `change` and requires existing no-date batch with enough quantity

**Side effects:**
- Creates `InvStockLog` entry with userName and optional note
- May create new `InvBatch` record
- Updates existing batch quantities
- Syncs `InvItem.quantity` to match batch totals
- `updatedAt` timestamp auto-updated on batch and item

## Dependencies

### Internal
- Database: `InvItem`, `InvBatch`, `InvStockLog`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`, `@/lib/roles` (`isAdminOrAbove`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
