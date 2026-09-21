---
name: css-tokens-and-utilities
description: CSS custom-property naming actually used in this repo (differs from generic guidance) and lack of a shared sr-only utility
metadata:
  type: project
---

Real token names seen in `src/components/missions/MissionWizard.module.css` and used across the app (fallbacks included in case var is undefined in some theme):
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary` (background layers)
- `--text-primary`, `--text-secondary` (not `--foreground`/`--text-secondary` naming from generic instructions — this repo uses `--text-*` and `--bg-*`, not `--background`/`--foreground`/`--card-bg`)
- `--border-primary`
- `--crf-red` (brand/primary — always provide `#c0122c` fallback, e.g. `var(--crf-red, #c0122c)`)
- `--success-bg` / `--success-text` (fallbacks `#dcfce7` / `#166534`)
- `--error-bg` / `--error-text` / `--error-border` (fallbacks `#fee2e2` / `#991b1b` / `#fca5a5`)

No shared `.sr-only` / visually-hidden utility class exists anywhere in `src/` (checked via grep, none found). If a component needs visually-hidden text for a11y, define a local `.srOnly` class in that component's own CSS module (clip-rect pattern) rather than assuming a global one exists.
