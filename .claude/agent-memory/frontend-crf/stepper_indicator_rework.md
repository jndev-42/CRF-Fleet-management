---
name: stepper-indicator-rework
description: What the MissionWizard step-progress indicator looks like now (numbered-circle stepper) and why it replaced the old per-step-label bar
metadata:
  type: project
---

`src/components/missions/MissionWizard.tsx` progress indicator was reworked (2026-09-18) from a row of equal-width `flex:1` cells each showing `"{n}. {label}"` to a compact numbered-circle stepper, because the wizard grew to up to 11 dynamically-shown steps (`activeSteps` array, built conditionally on form state) and cramming full labels like "Répartition interventions" next to "Photos" in equal-width cells wrapped unevenly and looked broken, especially on phones.

Current shape:
- Single-line heading above the stepper: `Étape {n} / {total} — {label}` (`id="wizard-step-heading"`), the only place the current step's full label is shown.
- `<ol>`/`<li>` stepper below it, `aria-labelledby="wizard-step-heading"` on the `<ol>` (no more `aria-label="Étapes du formulaire"` — that string is gone).
- Each `<li>` = a circle (`.stepperCircle`, digit or `Check` icon from lucide-react when done) + a connector line (`.stepperLine`, omitted after the last item) + sr-only text `Étape {n} : {label}` with `(étape en cours)`/`(étape terminée)` suffix for active/done.
- Three visual states reuse the same CSS tokens the old bar used: upcoming = `var(--bg-secondary)`/`var(--text-secondary)`, active = `var(--crf-red, #c0122c)`, done = `var(--success-bg, #dcfce7)`/`var(--success-text, #166534)`.
- Circle size 26px desktop, 20px under a `max-width: 480px` media query — verified by screenshot that 11 steps don't overflow or wrap at 320px and 375px viewport widths, in both themes.
- `activeSteps`/`currentStepIndex`/`handleNext`/`handleBack`/`validateStep` logic untouched — this was markup/CSS only.

Test conventions for this indicator: see [[rtl-component-test-conventions]]. Browser-verification method used: see [[browser-verification]].
