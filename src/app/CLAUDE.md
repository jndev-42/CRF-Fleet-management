# Pages (App Router)

All pages are **Client Components** (`'use client'`). Server Component migration is planned (M-4) but not started — don't convert yet.

For the standard page boilerplate (auth guard, data fetch, roles), invoke the `/page-template` skill.

## Styling
Pages use **global CSS classes** (not CSS Modules): `page-header`, `page-title`, `filters-bar`, `filter-btn`, `card`, etc.
Inline styles are acceptable for one-off overrides — always use CSS variables: `var(--bg-secondary)`, `var(--border-primary)`.

## Component size rule
**Keep page files under ~150 lines.** Extract concerns at natural boundaries:
- Data fetching → custom hook (`useDashboardData`, `useVehicleList`)
- Complex filter/sort logic → custom hook
- Each distinct UI section → dedicated component

**Always extract stateful logic into custom hooks.** Never split purely to meet a line count.

## Roles from session
Roles are in the JWT — no DB lookup needed in components or pages.
```ts
const roles = (session?.user?.roles || ['GUEST']) as string[];
const isAdmin = roles.includes('ADMIN');
```

## Error handling in fetch calls
Use `console.error(...)` for fetch errors. `alert()` is acceptable for user-facing errors in pages.
