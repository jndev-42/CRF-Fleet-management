# Components

For modal JSX, form hierarchy, and role-visibility patterns, invoke the `/component-templates` skill.

## Carpaccio rule — slice thin, extract early
**Any distinct UI section must live in its own component file.** Never leave large inline JSX blocks inside page files or parent components.

When a piece of UI has a clear identity (a legend, a toolbar, a card, a panel, a table, a stat block…), extract it immediately — even if it's currently small.

Page files should read like an outline:
```tsx
<PageHeader ... />
<RoleLegend />
<UsersTable ... />
```

## Component size rule
**Target: under 150 lines per component file.**
Split at natural concern boundaries — not to hit a number. A 160-line component with one concern is fine.

**Always extract stateful logic into custom hooks** (`use*.ts` in the same folder or a `hooks/` subfolder).

## Styling — three layers
1. **Global classes** (`modal`, `btn btn-primary`, `form-group`, `form-label`) — shared structural patterns
2. **CSS Modules** (`.module.css` co-located) — component-specific layout/styles
3. **Inline styles** — only for dynamic values; always use CSS variables

## Icons — lucide-react only
```tsx
import { Car, CheckCircle } from 'lucide-react';
<Car size={18} />
```

## Language
All user-facing text in **French**.
