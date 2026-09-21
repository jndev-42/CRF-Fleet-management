---
name: unused-inventory-tables
description: 8 dead Inv* tables from an abandoned inventory redesign were dropped from prod+preview on 2026-09-18 — historical context only, tables no longer exist
metadata:
  type: project
---

**RESOLVED 2026-09-18** — the 8 dead tables described below were dropped from both prod (`.env`) and preview (`.env.preview`) Turso DBs via `scripts/drop-unused-inventory-tables.ts --apply`. They no longer exist. This entry is kept as history in case similar-looking issues resurface (e.g. someone re-adds `scripts/add-inventory.ts`-style scaffolding).

Original finding (audit `2026-09-18`, applied same day): prod and preview both had a second, unused inventory schema — `InvLocation`, `InvStock`, `InvTemplate`, `InvGroupe`, `InvGroupeMember`, `InvTransfer`, `InvBagTemplate`, `InvBagTemplateItem` — created by `scripts/add-inventory.ts` for a location-based redesign whose app-level cutover never happened (`src/app/inventory/AGENTS.md` called it stale scaffolding). Row counts at drop time: prod `InvLocation`=10 (orphaned, all lost on drop — explicitly approved by user), preview `InvLocation`=4; all other 6 tables were 0 rows in both.

**Gotcha hit during the drop, worth remembering for any future multi-table DROP with FKs:** with `PRAGMA foreign_keys=ON` (Turso/libSQL default), `DROP TABLE` on a table that has an outgoing FK to another table *already dropped earlier in the same batch* fails with `SQLITE_UNKNOWN: no such table: main.<ReferencedTable>` — even though the table being dropped is the child, not the parent. Fix: wrap the batch of drops in `PRAGMA foreign_keys = OFF` / `... = ON`, not just careful ordering (ordering alone isn't enough when the graph isn't a strict DAG, e.g. `InvLocation` had FKs to both `InvBagTemplate` and to itself). Hit this on the prod run specifically when dropping `InvLocation` last — see `scripts/drop-unused-inventory-tables.ts` for the fixed pattern.

`scripts/import-ebrigade.ts` still references `InvLocation`/`InvStock` by name, but hardcodes `file:./dev.db` (local only per repo convention) — never touched prod/preview, so it wasn't a blocker. It does mean these table names could reappear in a local dev.db from that script; that's expected and harmless.

`StellantisSession` exists in preview only (not prod), zero code references anywhere — separate unrelated orphan, deliberately NOT touched by this cleanup. Still worth a future look if asked about DB cleanup again.

The LIVE inventory feature (`/inventory`, `/api/inventory/*`) uses `InvItem`, `InvStockLog`, `InvBatch`, `InvStockList` — untouched, unaffected by this drop, row counts verified stable after (prod: 328/801/121/7; preview: 476/822/223/6).
