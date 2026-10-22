<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Single expense report retrieval and state management. GET fetches report with full metadata (submitter, validator, rejector, payer names). PATCH handles state transitions and role-gated actions: owner edits drafts, RESPO signs the first validation step (v2 reports), manager (président/super admin) finalises or rejects at any stage, treasurer marks paid. DELETE removes draft reports (owner or super admin only).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (retrieve) — PATCH (state transitions) — DELETE (remove draft) |

## For AI Agents

### Working In This Directory

**GET:**
- Returns full report with all metadata and joined user names (submitter, validator, rejector, payer)
- Access (`canViewExpense`): owner, manager (SUPER_ADMIN/PRESIDENT), RESPO for non-draft reports of its active UL, or treasurer viewing 'en_attente_paiement' status
- Returns 403 if insufficient access

**PATCH:** State machine with action-driven transitions.
- Action enum: `'update'`, `'submit'`, `'validate'`, `'reject'`, `'pay'`
- `'update'` / `'submit'`: owner-only, draft-only. Can modify items, imputation, signatures. Submit triggers notification to the RESPO and PRESIDENT roles of the UL.
- `'validate'`: `soumis` v2 report → a RESPO moves it to `valide_respo`, whereas a manager signs both steps at once (`signsBothSteps`); `valide_respo` → manager only (`canSignStage`); a v1 report is manager-only. Nobody validates their own report (403). The final step moves to 'en_attente_paiement' (if refund requested) or 'traité'. Sends notification to TRESORIER if awaiting payment.
- `'reject'`: allowed to whoever can sign the current stage (RESPO at the RESPO stage, manager at any), never on one's own report. Requires `rejectionComment` (mandatory). Moves to 'refusé'.
- `'pay'`: treasurer or super admin only, awaiting-payment-only. Moves to 'traité'.
- Returns: `{ success: true, status }`

**DELETE:**
- Owner can delete draft-only. Super admin can delete any status.
- Returns 403 if not owner and not super admin, 400 if not draft (unless super admin).

**DB tables:** ExpenseReport, User

**Side effects:** Push notifications on submit and validate (if awaiting payment) ; the requester is notified (in-app + push, `notifyUsers`) of every decision: validated, paid, rejected (with reason).

## Dependencies

### Internal
- `@/lib/db` — Turso SQL queries
- `@/lib/push` — Push notifications
- `@/auth` — Session & roles

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
