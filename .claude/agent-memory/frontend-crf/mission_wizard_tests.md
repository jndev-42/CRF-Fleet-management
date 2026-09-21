---
name: rtl-component-test-conventions
description: How MissionWizard.test.tsx (and likely sibling component tests) query state — role/text patterns to reuse when editing wizard-style components
metadata:
  type: project
---

`src/__tests__/components/MissionWizard.test.tsx` drives the multi-step `MissionWizard` purely through Testing Library role/label queries, no snapshot tests. Patterns worth reusing when touching step indicators or wizard-like flows:
- Step content assertions go through `getByLabelText`/`getByRole('button', { name: 'Suivant' | 'Précédent' })`, not implementation details.
- Step-indicator assertions previously read the indicator's own text content directly (e.g. `'1. UL / DT'`). After reworking the indicator into a numbered-circle stepper (Sept 2026, see [[stepper-indicator-rework]]), the indicator's accessible state is exposed via: a heading `Étape {n} / {total} — {label}` (query with `getByRole('heading', { name: ... })`), plus per-circle screen-reader-only text `Étape {n} : {label}` (+ `(étape en cours)` / `(étape terminée)` suffix) inside each `<li>` — query via `getAllByRole('listitem')` and `.textContent.includes(...)`, not exact string equality, since the digit and the sr-only text concatenate in `textContent`.
- `activeSteps` array order and `validateStep` labels are the source of truth for both the component and the tests — when adding/removing/reordering wizard steps, update the label string in exactly one place (`activeSteps` in `MissionWizard.tsx`) and the tests will mostly still pass since they match on step *labels*, not step *numbers*, except where a test hardcodes the expected step count (e.g. `'Étape 2 / 9 — Général'` — the `9` needs updating if the RESEAU default step count changes).
