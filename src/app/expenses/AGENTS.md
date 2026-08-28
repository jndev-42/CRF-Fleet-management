<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# expenses

## Purpose
Expense report management (`/expenses`) — the *notes de frais* workflow. Volunteers create drafts, attach receipts, and submit them; Président/Super-Admin validate (with an electronic signature) or reject with a mandatory reason; Trésorier/Super-Admin mark validated reports as paid. Presents a sortable, paginated table with a detail sidebar, a receipt gallery (images + PDFs) with lightbox, and a per-report official PDF download.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `ExpensesPage` (~1275 lines) — the whole feature: scope/filter state, sorting, pagination, all five workflow actions, detail sidebar, receipts modal, and lightbox. |

## For AI Agents

### Working In This Directory
**Minimum role: any authenticated user** (unauthenticated → `/login`) — everyone can file their own reports. Three capability flags drive everything else:
- `isManager` = `SUPER_ADMIN | PRESIDENT` → validate and reject.
- `isTresorier` = `TRESORIER` → sees the UL payment queue.
- `canPay` = `TRESORIER | SUPER_ADMIN` → the "Indiquer comme payée" action.

Note these are inline `roles.includes(...)` checks; this page does **not** use the `@/lib/roles` helpers.

**Status machine** — `brouillon → soumis → en_attente_paiement → traité`, with `refusé` as a terminal branch. Every action is gated on both status and role, and the same gate is duplicated in the table row and the sidebar; change both together:
| Action | Requires |
|--------|----------|
| Edit / Submit / Delete | `brouillon` **and** `report.userId === session.user.id` (authors only — managers cannot edit someone's draft) |
| Validate / Reject | `soumis` and `isManager` |
| Mark paid | `en_attente_paiement` and `canPay` |
| PDF download | any status except `brouillon` |

**Les TROIS actions exigent une signature manuscrite.** Validation, refus et paiement passent tous par `YousignSignatureModal`, via l'état unifié `signingContext: { report, kind: 'validate' | 'reject' | 'pay', rejectionComment? }`. Son `onSign` appelle `confirmSigned(sigData)`, qui `PATCH` la charge utile correspondante (`validatorSignature` pour validation et refus, `payerSignature` pour le paiement).

N'ajoutez jamais de chemin qui contourne le modal : la signature est apposée sur le PDF puis **scellée cryptographiquement**, et le serveur renvoie 400 sans elle. Le refus collecte d'abord son motif via `prompt()` (obligatoire, vérifié côté client) puis demande la signature — c'est un événement signé qui **clôt définitivement** le document ; une correction passe par une note neuve.

La signature du payeur est scellée mais **n'apparaît pas visuellement** sur le PDF : elle ne figure qu'au panneau Signatures d'Acrobat.

All four mutations are `PATCH /api/expenses/{id}` distinguished by an `action` field (`validate` / `reject` / `pay` / `submit`); deletion is `DELETE /api/expenses/{id}`. After each success the page refetches **and** patches `selectedReport` in place so the open sidebar reflects the new status immediately.

**Scope defaults depend on role:** the `viewScope` state starts at `'my'` but a one-shot effect (guarded by `hasInitializedScope`) flips managers and trésoriers to `'ul'` so they land on their work queue. The `hasInitializedScope` flag exists to keep a later manual switch to "Mes notes" from being overwritten — keep it. The scope tab label is role-dependent ("Notes à traiter (UL)" vs "Notes en attente de paiement"). `includeProcessed` (managers, UL scope only) adds `includeProcessed=true` to the query.

Sorting and pagination are **entirely client-side** (`useMemo` over the fetched array; page sizes 5/10/25/50, default 10). The API returns a plain array, not a paginated envelope. Sorting `date` falls back to `createdAt` when `submittedAt` is null — drafts have no submission date. Any change of sort or page size resets to page 1.

Two loading flags: `loading` (initial, full-page message) and `tableLoading` (refetch, dims the table to `opacity: 0.6` instead of unmounting it). Per-row busy state is the single `actionLoading` holding a report id.

Receipts come from `GET /api/drive/photos?folderId=...&flat=true`, refetched whenever `selectedReport` changes. PDFs are detected by `mimeType === 'application/pdf'` **or** a `.pdf` filename suffix and get a `FileText` placeholder card; images are clickable into a full-screen lightbox. Both use `<img>`/`<a>` with `@next/next/no-img-element` disables because the Drive proxy URLs are dynamic.

The create/edit form replaces the whole list view (`isCreating` toggles between `ExpenseForm` and the grid) rather than opening a modal. `editingReport` is passed as `initialData`.

Errors use `alert()` for action failures and `console.error` for fetch failures — consistent with the parent convention.

**On the ~150-line convention:** this file is roughly eight times over it. If you make a substantial change, extract the fetch/scope logic into a hook and the table, sidebar, and receipts modal into components rather than growing it further.

## Dependencies

### Internal
- `@/components/expenses/ExpenseForm` — create/edit form (owns `POST`/`PUT`)
- `@/components/expenses/YousignSignatureModal` — validator signature capture, exports `SignatureData`
- `GET /api/expenses?scope=my|ul&includeProcessed=`, `PATCH /api/expenses/{id}`, `DELETE /api/expenses/{id}`, `GET /api/expenses/{id}/pdf`
- `GET /api/drive/photos?folderId=&flat=true` and `GET /api/drive/photos/{id}` — receipts
- Global CSS: `expenses-container`, `expenses-grid`, `expense-scope-tabs`, `expense-scope-btn`, `modal-overlay`, `modal`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
