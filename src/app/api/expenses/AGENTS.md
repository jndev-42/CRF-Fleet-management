<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Expenses

## Purpose
Expense report CRUD operations. Lists expense reports (filtered by user, unit leader, or treasurer scope), creates new drafts, and handles state transitions (draft → submitted → validated → paid). Manages role-based visibility and push notifications.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list, scope-aware) — POST (create draft/submit) |

## Subdirectories
- [`[id]`]([id]/AGENTS.md) — Retrieve, update, delete specific expense report
- [`[id]/pdf`]([id]/pdf/AGENTS.md) — Generate PDF export of expense report
- [`upload`](upload/AGENTS.md) — Deposit receipt files to R2 staging (embedded as PDF pages at submission)

## For AI Agents

### Working In This Directory

**GET:** Lists expense reports with role-based scope.
- `scope` query param: `'my'` (default if not manager/treasurer) or `'ul'` (unit-level)
- `includeProcessed` query param: `'true'` to include paid/rejected reports (managers only)
- Roles: `SUPER_ADMIN`, `PRESIDENT` (managers), `TRESORIER` (treasurer), or owner (their own)
- Returns: array of reports with user, validator, rejector, payer metadata

**POST:** Create new expense report (draft or immediate submit).
- Requires Zod schema: status (`'brouillon'` or `'soumis'`), imputation enum, items array (label + amount), optional signatures/driveFolderId
- Min 1 item required, amounts must be positive
- Calculates total from items
- If status = `'soumis'`: sends push notification to PRESIDENT role
- Returns: `{ success: true, id }`

**DB tables:** ExpenseReport, User

**Side effects:** Push notifications (OneSignal) to PRESIDENT on submit.

## Dependencies

### Internal
- `@/lib/db` — Turso SQL queries
- `@/lib/onesignal` — Push notifications (lazy imported)
- `@/auth` — Authentication & role extraction from JWT

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
