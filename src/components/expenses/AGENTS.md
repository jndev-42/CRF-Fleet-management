<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# expenses

## Purpose
Expense report ("note de frais") UI: the create/edit form, the electronic signature dialog that gates submission, and the `@react-pdf/renderer` document used to render a signed report to PDF. The form and signature modal are consumed by `src/app/expenses/page.tsx`; the PDF document is **not** a browser component — it is rendered server-side by `src/app/api/expenses/[id]/pdf/route.ts`.

## Key Files
| File | Description |
|------|-------------|
| `ExpenseForm.tsx` | Create or edit an expense report: dynamic line items (label + amount), imputation selector (`DLUS`/`DLAS`/`UL`/`Autre` + free-text when `Autre`), refund request toggle, no-receipt sworn declaration, receipt photos via `PhotoPicker`. Computes the running total. Saves as `brouillon` directly; saving as `soumis` first opens the signature modal. |
| `ElectronicSignatureModal.tsx` | Signature capture with two modes: `typed` (name rendered as a script signature) and `draw` (touch/mouse `<canvas>`, scaled by `getBoundingClientRect`). Collects the signer's function title and consent, then hands back a `SignatureData` (mode, base64 image, name, date, hash). Exports `SignatureData`. |
| `ExpensePdfDocument.tsx` | `@react-pdf/renderer` `Document` for the official expense form — header/logo, items table, total, imputation, sworn declaration, requester and validator signature blocks, UL stamp image. Exports `ParsedSignature` and `ExpensePdfReportProps`. |

## For AI Agents

### Working In This Directory
**Submission flow — do not shortcut it.** `ExpenseForm` never POSTs a `soumis` report without a signature: `handleInitiateSubmit('soumis')` opens `ElectronicSignatureModal`, and only `handleSignatureConfirmed` calls `executeSave('soumis', sigData, funcTitle)`. Drafts bypass the modal. Receipts upload *first* (`POST /api/expenses/upload` with `FormData`, reusing `initialData.driveFolderId` when editing) and the resulting `folderId` is then attached to the report payload — a 413 from that upload is surfaced as an explicit French size-limit message.

**Validation lives in `validateForm()`** (`ExpenseForm.tsx:89`): at least one item with a label and amount > 0; a custom imputation string when imputation is `Autre`; and — when a refund is requested — either at least one receipt photo or the checked sworn declaration (or an existing `driveFolderId` on edit). Amount inputs are sanitized to digits/separators with `,` normalized to `.`, and kept as **strings** in state (`ExpenseItem.amount: string`) for editing ease; parse only at save time.

`ExpenseForm` is create *and* edit — the optional `initialData` prop seeds every field and switches the target endpoint. `ElectronicSignatureModal` resets its internal state on the `isOpen` false→true transition via a render-time `prevIsOpen` comparison, not a `useEffect`.

**`ExpensePdfDocument.tsx` is a server-rendered PDF, not DOM.** It uses `StyleSheet.create` from `@react-pdf/renderer` — no CSS Modules, no global classes, no `lucide-react` icons, no hooks. Signature fields accept either a raw base64 string or a `ParsedSignature` object, so handle both shapes when touching the signature blocks.

**Changing its layout moves the signature widgets.** The rectangles in `signature-layout.ts` are *measured* on this render, and a widget placed wrong is frozen by DocMDP at the first seal — uncorrectable. After any layout change, re-run `npx tsx scripts/measure-signature-rects.ts` and report the values; `signature-geometry.test.ts` fails until you do. Three invariants keep the block stable and must survive edits: the `flexGrow` spacer, the fixed-height metadata block, and the fixed-height footer (rendered even without a logo).

## Dependencies

### Internal
- `POST /api/expenses/upload` — receipt upload to Drive, returns `{ folderId }`
- `POST /api/expenses` — create; `PATCH /api/expenses/[id]` — update/submit (`{ action: 'submit' | 'update', status, ... }`)
- `GET /api/expenses/[id]/pdf` — server route that renders `ExpensePdfDocument`
- `@/components/ui/PhotoPicker` — receipt selection; `next-auth/react` `useSession` for signer identity

### External
- `@react-pdf/renderer` — `ExpensePdfDocument` only

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
