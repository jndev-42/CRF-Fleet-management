<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# inventory

## Purpose
Stock inventory page (`/inventory`) — manages medical and logistics supplies across multiple named stocks. Readable by any authenticated user (item list, per-item movement history, expiry batches, low-stock and expiring-soon reports); admins additionally get item create/edit/delete, quantity adjustment buttons, and stock create/rename/delete. Items are paginated 20 per page with text search and category chip filtering, and each row shows a colour-coded nearest-expiry date.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `InventoryPage` — stock tabs, search/category/pagination state, item table, quantity adjustment, and seven modal mounts. |
| `page.module.css` | **CSS Module** for page shell, header, toolbar, table, category badge, action buttons, pagination. |
| `types.ts` | Inventory domain types (`InvItem`, `InvLocation`, `InvStock`, `InvTemplate`, `InvBagTemplate*`, `InvGroupe`, `InventoryKPIs`, `LocationType`, `StockStatus`). **Currently unimported** — see the caution below. |

## For AI Agents

### Working In This Directory
**Minimum role: any authenticated user** (unauthenticated → `/login`). Write actions are gated on `isAdmin = isAdminOrAbove(userRoles)` (SUPER_ADMIN or ADMIN): the "+ Nouvel article" button, the Actions table column, per-row edit/delete, the quantity `-10/-1/+1/+10` buttons and the custom-quantity input, and — via the `isAdmin` prop on `StockTabs` — stock management. The "Stock faible" and "Périmé bientôt" report buttons are open to everyone.

**Caution on `types.ts`:** nothing in the repo imports `@/app/inventory/types` — `page.tsx` declares its own local, much smaller `InvItem` (id, name, category, quantity, notes, updatedAt, nearestExpiry, minStock). The file also carries self-described migration aliases (`InventoryItem`, `InventoryLot`, `InventoryTransferPayload`) marked "à supprimer après la bascule complète". Treat it as stale scaffolding: verify before importing from it, and do not assume the page's shapes match it.

Data flow — four cooperating effects:
1. `GET /api/inventory/stocks` loads the stock list and auto-selects the first stock when none is active.
2. `GET /api/inventory?categoriesOnly=1&stockId=...` reloads the category chips whenever the active stock changes.
3. `fetchInventory` (a `useCallback` over `search`, `categoryFilter`, `page`, `activeStockId`) calls `GET /api/inventory?stockId=&search=&category=&page=&pageSize=20`.

Every stock switch resets `search`, `categoryFilter`, and `page` — replicate that reset if you add another filter, or the new filter will leak across stocks.

`handleAdjust(itemId, change)` posts to `/api/inventory/adjust` with an auto-generated French note (`Ajout manuel (n)` / `Retrait manuel (n)`) and patches `quantity` from the response's `newQuantity` rather than refetching. It is guarded against re-entry via the per-item `adjusting` map and ignores `change === 0`. The `-1` button is disabled at `quantity <= 0` and `-10` at `quantity < 10`, so stock cannot be driven negative from the UI.

Per-item busy state is tracked in `Record<string, boolean>` maps (`adjusting`, `deleting`) plus `customChanges` for the free-text quantity input — keyed by item id, not index.

`getExpiryDisplay()` colours the nearest expiry: red `#dc2626` if already past, orange `#d97706` within 31 days, green `#16a34a` beyond. Dates render as `YYYY/MM/DD`. Null → `—` with inherited colour.

Deleting a stock is destructive (it removes all contained items) and is confirmed with an explicit uppercase-ATTENTION `confirm()`. If the active stock is deleted, selection falls back to `updated[0]?.id || ''`.

Category chips are inline-styled pills rather than the global `filter-btn` class used elsewhere.

## Dependencies

### Internal
- `@/components/inventory/StockTabs`
- `@/components/inventory/modals/` — `AddItemModal`, `EditItemModal`, `InventoryHistoryModal`, `ItemBatchesModal`, `ExpiringSoonModal`, `LowStockModal`, `StockModal`
- `@/lib/inventory/stocks` — `InvStockListRow` (the type actually used for stocks)
- `@/lib/roles` — `isAdminOrAbove`
- `GET /api/inventory` (list, `categoriesOnly=1`), `DELETE /api/inventory?id=`
- `POST /api/inventory/adjust`
- `GET|POST|PATCH /api/inventory/stocks`, `DELETE /api/inventory/stocks?id=`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
