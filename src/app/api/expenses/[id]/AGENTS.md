<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Single expense report retrieval and state management. GET fetches report with full metadata (submitter, validator, rejector, payer names). PATCH handles state transitions and role-gated actions: owner edits drafts, manager validates/rejects, treasurer marks paid. DELETE removes draft reports (owner or super admin only).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (retrieve) — PATCH (state transitions) — DELETE (remove draft) |

## For AI Agents

### Working In This Directory

**GET:**
- Returns full report with all metadata and joined user names (submitter, validator, rejector, payer)
- Access: owner, manager (SUPER_ADMIN/PRESIDENT), or treasurer viewing 'en_attente_paiement' status
- Returns 403 if insufficient access

**PATCH:** State machine with action-driven transitions.
- Action enum: `'update'`, `'submit'`, `'validate'`, `'reject'`, `'pay'`
- `'update'` / `'submit'`: owner-only, draft-only. Can modify items, imputation, signatures. Submit triggers notification to PRESIDENT.
- `'validate'`: manager-only, submitted-only. Moves to 'en_attente_paiement' (if refund requested) or 'traité'. Sends notification to TRESORIER if awaiting payment.
- `'reject'`: manager-only, submitted-only. Requires `rejectionComment` (mandatory). Moves to 'refusé'.
- `'pay'`: treasurer or super admin only, awaiting-payment-only. Moves to 'traité'.
- Returns: `{ success: true, status }`

**DELETE:**
- Owner can delete draft-only. Super admin can delete any status.
- Returns 403 if not owner and not super admin, 400 if not draft (unless super admin).

**DB tables:** ExpenseReport, User

**Side effects:** Push notifications on submit and validate (if awaiting payment).

## Dependencies

### Internal
- `@/lib/db` — Turso SQL queries
- `@/lib/onesignal` — Push notifications
- `@/auth` — Session & roles

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
