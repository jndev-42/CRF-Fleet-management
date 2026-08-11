<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# stats/expenses

## Purpose
Expense report statistics endpoint. Fetches aggregated expense data (reports, totals, status) for a given date range, filtered by optional imputation code. Restricted to financial managers and administrators.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET: fetch expense stats data; roles: SUPER_ADMIN, PRESIDENT, TRESORIER |

## Subdirectories
- `csv/` — Expense CSV export
- `pdf/` — Expense PDF export

## For AI Agents

### Working In This Directory
- GET accepts query params: `dateFrom`, `dateTo`, `imputation` (optional)
- Access restricted to: SUPER_ADMIN, PRESIDENT, or TRESORIER roles
- Calls `fetchExpenseStatsData()` lib function with filters: { ulId, imputation }
- Uses session user's ulId (defaults to 'ul-paris-18' if not set)
- Returns `{ success: true, data: ... }` or error with French message
- No date range validation in GET (unlike /api/stats)

## Dependencies

### Internal
- `@/lib/stats` — `fetchExpenseStatsData()` function
- User session must have `ulId` and roles in JWT

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
