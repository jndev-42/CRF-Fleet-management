<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-09-21 -->

# modals

## Purpose
Every dialog of the inventory module: item create/edit, per-item batch management (quantities + expiry dates), stock create/rename/duplicate, CSV mass import, stock QR code, movement history, and the two alert lists (low stock, expiring soon). All are opened by `src/app/inventory/page.tsx`.

## Key Files
| File | Description |
|------|-------------|
| `AddItemModal.tsx` | Create an inventory item in the current stock — name, category, notes, min stock, optional initial quantity/expiry. `POST /api/inventory`. |
| `EditItemModal.tsx` | Edit an existing item's name, category, notes, min stock. `PATCH /api/inventory`. |
| `ItemBatchesModal.tsx` | The item's batch list (quantity + expiry per batch): add a batch, adjust quantity, delete a batch. Largest file here (~370 lines). |
| `StockModal.tsx` | Tri-purpose stock name dialog — `mode: 'create' \| 'rename' \| 'duplicate'`. Delegates persistence to the page via `onSubmit(name, { copyStock })`. |
| `ImportCsvModal.tsx` | Create a whole stock from a CSV file (name + `<input type="file">`, `multipart/form-data` to `POST /api/inventory/stocks/import`). Renders per-line validation errors returned in `data.lines`; calls `onSuccess({ stockId, itemCount })`. Opened from the `onOpenImport` button of `StockTabs` (admin-only). |
| `StockQRCodeModal.tsx` | Printable QR code for one stock — fetches/regenerates the token itself from `/api/inventory/stocks/[id]/qr-token`. |
| `InventoryHistoryModal.tsx` | Read-only movement log for one item (change, user, timestamp, note) from `GET /api/inventory/history?itemId=`. |
| `LowStockModal.tsx` | Items at or below `minStock` for the stock; each row can jump to that item's batches. |
| `ExpiringSoonModal.tsx` | Batches nearing expiry for the stock; each row can jump to that item's batches. |

## For AI Agents

### Working In This Directory
Two prop conventions coexist — pick the one matching the modal's job:

- **Self-fetching, uncontrolled visibility** (`ItemBatchesModal`, `InventoryHistoryModal`, `LowStockModal`, `ExpiringSoonModal`): no `isOpen` prop — the page conditionally renders them. They fetch their own data in a `useEffect` on mount and take `onClose` plus an optional refresh/navigation callback.
- **Controlled visibility, self-submitting** (`AddItemModal`, `EditItemModal`, `ImportCsvModal`): take `isOpen` and return `null` when closed; own their form state and POST/PATCH themselves, then call `onSuccess()` so the page refetches. `ImportCsvModal` passes `{ stockId, itemCount }` to `onSuccess` so the page can select the freshly imported stock.
- **Controlled and submission-delegated** (`StockModal`): takes `isOpen` + `mode` + `initialName` (+ `sourceStockName` in `duplicate` mode) and calls `onSubmit(name, { copyStock }): Promise<void>` — it does *not* call the API itself.

**`stockId` is optional** on `AddItemModal`, `LowStockModal`, and `ExpiringSoonModal`. When absent, the alert modals query the endpoint without the `stockId` param (all stocks); when present it is appended `encodeURIComponent`-ed. Don't make it required.

**Cross-modal navigation.** `LowStockModal` and `ExpiringSoonModal` both take `onOpenBatches(itemId, itemName)` — they don't open `ItemBatchesModal` themselves, they ask the page to swap modals. Preserve that indirection.

**Role visibility.** `ItemBatchesModal` is the only modal here that reads roles directly: `isAdminOrAbove((session?.user?.roles ?? []) as string[])` from `@/lib/roles` via `useSession()`, gating batch deletion. Elsewhere admin state arrives as a prop from the page.

**`StockQRCodeModal` — two deliberate divergences from the vehicle `QRCodeModal` it is adapted from:**
- The canvas id is **`qr-stock-code-canvas`**, not `qr-code-canvas`. `downloadQRCode` resolves it with a global `getElementById`; if both modals used the same id, whichever mounted first would be downloaded. Pinned by AC-Q4 — do not "simplify" the id back.
- Regeneration errors render in an **inline box**, not `alert()`. Regeneration is destructive (every printed QR for that stock dies instantly), so the failure has to stay on screen next to the button that caused it.
Confirmation before the `DELETE` is required (AC-Q5/AC-Q6), and the "Régénérer" button is gated on `canAccessAdminPanel(userRoles)` — roles arrive as a **prop** from the page, as everywhere else here except `ItemBatchesModal`.

**Styling.** Global classes (`modal`, `btn btn-primary`, `form-group`, `form-label`, `form-input`) plus a co-located `<Modal>.module.css` per modal for everything static (overlay `z-index`, `max-width`, error banners, tables, chips). Inline `style` is reserved for values computed at runtime — the selected category chip, `deficitColor(item)`, the expired-row tint, the "copied" state of the QR button. Don't move a static rule back inline. All labels, buttons, and error messages in French.

**Error banners and double submission.** Every visible error block carries `role="alert"` (repo convention, same as `MissionWizard`'s `errorBox` — no separate `aria-live`). Every form submit handler opens with `if (submitting) return;` before any async work, so a double-click or double-Enter cannot fire two requests before `disabled` renders. Keep both when adding a modal here.

## Dependencies

### Internal
- `POST /api/inventory` (create item), `PATCH /api/inventory` (edit item)
- `GET /api/inventory/batches?itemId=`, `POST /api/inventory/batches`, `DELETE /api/inventory/batches?batchId=`
- `POST /api/inventory/adjust` — batch quantity adjustment
- `GET /api/inventory/history?itemId=`
- `GET /api/inventory/low-stock[?stockId=]`, `GET /api/inventory/expiring-soon[?stockId=]`
- `POST|DELETE /api/inventory/stocks/[id]/qr-token` — `StockQRCodeModal`
- `POST /api/inventory/stocks/import` — `ImportCsvModal` (`multipart/form-data`: `name` + `file`)
- `@/lib/roles` — `isAdminOrAbove` (`ItemBatchesModal` only), `canAccessAdminPanel` (`StockQRCodeModal`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
