<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# inventory

## Purpose
UI for the inventory/stock module. This level holds the stock selector tabs; every dialog lives in `modals/`. All of it is driven by the single page `src/app/inventory/page.tsx`, which owns the stock list, the active stock, the item table, and which modal is open.

## Key Files
| File | Description |
|------|-------------|
| `StockTabs.tsx` | Horizontal tab strip of stocks (`role="tablist"`). Highlights the active stock; for admins adds per-tab rename (✏️) and delete (✕) buttons plus a trailing "Nouveau stock" (+) button. |
| `StockTabs.module.css` | Tab strip layout, active-tab styling, hover-revealed tab actions. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `modals/` | Item CRUD, batches, stock create/rename, low-stock and expiry alert dialogs (see `modals/AGENTS.md`) |

## For AI Agents

### Working In This Directory
`StockTabs` is **fully controlled and fetch-free** — it takes `stocks: InvStockListRow[]`, `activeStockId`, `isAdmin`, and four callbacks (`onSelectStock`, `onOpenCreate`, `onOpenRename`, `onDeleteStock`). Never add a `fetch` here; the page owns stock data.

Two non-obvious behaviors to preserve:
- **Admin actions are gated on the `isAdmin` prop** (derived from session roles by the page, not read from `useSession()` here). The delete button is additionally hidden when `stocks.length <= 1` — the last stock must not be deletable.
- The tab-actions wrapper calls `e.stopPropagation()` so clicking rename/delete does not also select the tab. Keep that if you add another action button.

Item shape comes from `InvStockListRow` in `@/lib/inventory/stocks` — import it, don't redeclare a local stock type. Tabs are `<div role="tab">` with `aria-selected`; keep the ARIA roles intact.

Note the emoji glyphs (📦 ✏️ ✕) rather than `lucide-react` icons — this predates the icon convention. New icons added here should use `lucide-react`.

## Dependencies

### Internal
- `@/lib/inventory/stocks` — `InvStockListRow` type
- `src/app/inventory/page.tsx` — sole consumer; owns all inventory API calls at this level (`/api/inventory/stocks`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
