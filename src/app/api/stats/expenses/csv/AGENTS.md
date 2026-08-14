<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/expenses/csv

## Purpose
Expense report CSV export endpoint using two-step job pattern. POST generates CSV from ExpenseReport + User data; GET downloads by jobId.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST: generate expense CSV job; GET: download CSV by jobId. Roles: SUPER_ADMIN, PRESIDENT, TRESORIER |

## For AI Agents

### Working In This Directory
- **POST:** Accepts `{ dateFrom, dateTo }` body, validates date range (>= 0 days, <= 62 days), queries ExpenseReport + User tables, generates CSV with status labels, stores in global `__expenseCsvJobs` Map, returns `{ jobId, status: 'ready' }`
- **GET:** Accepts `jobId` query param, validates UUID format, retrieves buffer from global map, streams as `text/csv` attachment, cleans up jobs older than 10 minutes
- Roles: SUPER_ADMIN, PRESIDENT, or TRESORIER only
- Date filter: uses `COALESCE(submittedAt, createdAt)` to allow sorting by submission or creation date
- CSV columns (French): ID Note, Date soumission, Statut, Demandeur, Email demandeur, Imputation, Detail Imputation, Remboursement demande, Declaration sans justificatif, Total (EUR), Nb d'articles, Détail des lignes de dépense
- Status mapping: brouillon→Brouillon, soumis→Soumis, en_attente_paiement→En attente de paiement, traité→Traitée / Payée, refusé→Refusée
- Items field is JSON array; parses and formats as pipe-separated summary

## Dependencies

### Internal
- `@/lib/db` — ExpenseReport, User queries
- ExpenseReport columns: id, submittedAt, createdAt, status, userId, imputation, customImputation, requestRefund, noReceiptDeclaration, total, items (JSON)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
