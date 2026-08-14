<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# modals

## Purpose
Every dialog of the inventory module: item create/edit, per-item batch management (quantities + expiry dates), stock create/rename, movement history, and the two alert lists (low stock, expiring soon). All are opened by `src/app/inventory/page.tsx`.

## Key Files
| File | Description |
|------|-------------|
| `AddItemModal.tsx` | Create an inventory item in the current stock — name, category, notes, min stock, optional initial quantity/expiry. `POST /api/inventory`. |
| `EditItemModal.tsx` | Edit an existing item's name, category, notes, min stock. `PATCH /api/inventory`. |
| `ItemBatchesModal.tsx` | The item's batch list (quantity + expiry per batch): add a batch, adjust quantity, delete a batch. Largest file here (~370 lines). |
| `StockModal.tsx` | Dual-purpose stock name dialog — `mode: 'create' \| 'rename'`. Delegates persistence to the page via `onSubmit(name)`. |
| `InventoryHistoryModal.tsx` | Read-only movement log for one item (change, user, timestamp, note) from `GET /api/inventory/history?itemId=`. |
| `LowStockModal.tsx` | Items at or below `minStock` for the stock; each row can jump to that item's batches. |
| `ExpiringSoonModal.tsx` | Batches nearing expiry for the stock; each row can jump to that item's batches. |

## For AI Agents

### Working In This Directory
Two prop conventions coexist — pick the one matching the modal's job:

- **Self-fetching, uncontrolled visibility** (`ItemBatchesModal`, `InventoryHistoryModal`, `LowStockModal`, `ExpiringSoonModal`): no `isOpen` prop — the page conditionally renders them. They fetch their own data in a `useEffect` on mount and take `onClose` plus an optional refresh/navigation callback.
- **Controlled visibility, self-submitting** (`AddItemModal`, `EditItemModal`): take `isOpen` and return `null` when closed; own their form state and POST/PATCH themselves, then call `onSuccess()` so the page refetches.
- **Controlled and submission-delegated** (`StockModal`): takes `isOpen` + `mode` + `initialName` and calls `onSubmit(name): Promise<void>` — it does *not* call the API itself.

**`stockId` is optional** on `AddItemModal`, `LowStockModal`, and `ExpiringSoonModal`. When absent, the alert modals query the endpoint without the `stockId` param (all stocks); when present it is appended `encodeURIComponent`-ed. Don't make it required.

**Cross-modal navigation.** `LowStockModal` and `ExpiringSoonModal` both take `onOpenBatches(itemId, itemName)` — they don't open `ItemBatchesModal` themselves, they ask the page to swap modals. Preserve that indirection.

**Role visibility.** `ItemBatchesModal` is the only modal here that reads roles directly: `isAdminOrAbove((session?.user?.roles ?? []) as string[])` from `@/lib/roles` via `useSession()`, gating batch deletion. Elsewhere admin state arrives as a prop from the page.

**Styling.** No CSS Modules in this directory — global classes (`modal`, `btn btn-primary`, `form-group`, `form-label`, `form-input`) plus inline styles on CSS variables. All labels, buttons, and error messages in French.

## Dependencies

### Internal
- `POST /api/inventory` (create item), `PATCH /api/inventory` (edit item)
- `GET /api/inventory/batches?itemId=`, `POST /api/inventory/batches`, `DELETE /api/inventory/batches?batchId=`
- `POST /api/inventory/adjust` — batch quantity adjustment
- `GET /api/inventory/history?itemId=`
- `GET /api/inventory/low-stock[?stockId=]`, `GET /api/inventory/expiring-soon[?stockId=]`
- `@/lib/roles` — `isAdminOrAbove` (`ItemBatchesModal` only)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
