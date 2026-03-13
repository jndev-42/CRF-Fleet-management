# Components

## Carpaccio rule — slice thin, extract early
**Any distinct UI section must live in its own component file.** Never leave large inline JSX blocks inside page files or parent components.

When a piece of UI has a clear identity (a legend, a toolbar, a card, a panel, a table, a stat block…), extract it immediately — even if it's currently small. This keeps pages readable and components reusable.

Page files should read like an outline:
```tsx
<PageHeader ... />
<RoleLegend />
<UsersTable ... />
```
Not like a wall of JSX.

## Component size rule
**Target: under 150 lines per component file.**
If a component exceeds this, evaluate whether it contains distinct concerns (data fetching, separate UI sections, reusable logic). Split at those natural boundaries — not to hit a number.

**Always extract stateful logic into custom hooks** (`use*.ts` in the same folder or a `hooks/` subfolder).
Never split purely to meet a line count — a 160-line component with one concern is fine.

Examples of natural split boundaries:
- `CheckOutModal.tsx` has form state, session prefill, photo upload, submit — these are distinct → hooks
- `VehicleDetail` has trip list, reservation list, checklist, metrics — these are distinct UI sections → sub-components

## Styling — three layers, know when to use each
1. **Global classes** (`modal`, `btn btn-primary`, `form-group`, `form-label`) — for shared structural patterns
2. **CSS Modules** (`.module.css` co-located) — for component-specific layout/styles
3. **Inline styles** — only for dynamic values or one-off overrides; always use CSS variables:
   ```tsx
   style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}
   ```

## Icons — lucide-react only
```tsx
import { Car, CheckCircle, AlertTriangle } from 'lucide-react';
<Car size={18} />
```

## Modal structure
```tsx
<div className="modal-overlay" onClick={onClose}>
  <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"
       onClick={e => e.stopPropagation()}>
    <div className="modal-header">
      <h2 id="modal-title" className="modal-title">...</h2>
      <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
    </div>
    ...
  </div>
</div>
```

## Forms
Use `.form-row` > `.form-group` > `.form-label` + `.form-input`/`.form-select` class hierarchy.
Controlled inputs only — no uncontrolled refs for form fields.

## Language
All user-facing text in **French**.

## Role-based visibility
```tsx
{roles.includes('ADMIN') && <button>Supprimer</button>}
```
Roles come from `useSession()` → `session.user.roles`. Never fetch roles from the DB in a component.
