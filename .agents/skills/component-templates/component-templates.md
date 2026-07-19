# /component-templates

Boilerplate for new components and modals in `src/components/`.

## Modal structure
```tsx
<div className="modal-overlay" onClick={onClose}>
  <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"
       onClick={e => e.stopPropagation()}>
    <div className="modal-header">
      <h2 id="modal-title" className="modal-title">...</h2>
      <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
    </div>
    <div className="modal-body">
      {/* content */}
    </div>
    <div className="modal-footer">
      <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" onClick={handleSubmit}>Confirmer</button>
    </div>
  </div>
</div>
```

## Form hierarchy
```tsx
<form onSubmit={handleSubmit}>
  <div className="form-row">
    <div className="form-group">
      <label className="form-label" htmlFor="field-id">Libellé</label>
      <input
        id="field-id"
        className="form-input"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
    </div>
    <div className="form-group">
      <label className="form-label" htmlFor="select-id">Choix</label>
      <select id="select-id" className="form-select" value={selected} onChange={...}>
        <option value="">-- Choisir --</option>
      </select>
    </div>
  </div>
</form>
```
Controlled inputs only — no uncontrolled refs for form fields.

## Role-based visibility
```tsx
const roles = (session?.user?.roles || ['GUEST']) as string[];

{roles.includes('ADMIN') && <button>Supprimer</button>}
{roles.some(r => ['ADMIN', 'RESPO'].includes(r)) && <button>Modifier</button>}
```
Roles come from `useSession()` → `session.user.roles`. Never fetch roles from the DB in a component.

## Icons — lucide-react only
```tsx
import { Car, CheckCircle, AlertTriangle } from 'lucide-react';
<Car size={18} />
```

## Inline styles — always use CSS variables
```tsx
style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}
```
