<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# app

## Purpose
Next.js App Router root: page routes (French-language UI, Client Components) and the `api/` REST endpoint tree.

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | Root layout — theme provider, navbar, global providers |
| `page.tsx` | Home/dashboard page |
| `globals.css` | Global CSS classes and CSS variables (`--bg-secondary`, `--border-primary`, etc.) |
| `icon.svg` | App favicon |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `api/` | REST API routes (see `api/AGENTS.md`) |
| `aide/`, `expenses/`, `inactif/`, `inventory/`, `login/`, `mentions-legales/`, `missions/`, `qr/`, `stats/`, `users/`, `vehicles/` | Feature pages, one directory per route (see each `AGENTS.md`) |

## For AI Agents

### Working In This Directory
All pages are **Client Components** (`'use client'`). Server Component migration is planned (M-4) but **not started — don't convert yet**.
New page → invoke `/page-template` skill for the standard boilerplate (auth guard, data fetch, roles).

### Styling
Pages use **global CSS classes** (not CSS Modules): `page-header`, `page-title`, `filters-bar`, `filter-btn`, `card`, etc. Inline styles are acceptable for one-off overrides — always use CSS variables.

### Component size rule
Keep page files under ~150 lines. Extract concerns at natural boundaries: data fetching → custom hook (`useDashboardData`, `useVehicleList`), complex filter/sort logic → custom hook, each distinct UI section → dedicated component. Always extract stateful logic into custom hooks — never split purely to meet a line count.

### Roles from session
Roles are in the JWT — no DB lookup needed in components or pages:
```ts
const roles = (session?.user?.roles || ['GUEST']) as string[];
const isAdmin = roles.includes('ADMIN');
```

### Error handling in fetch calls
Use `console.error(...)` for fetch errors. `alert()` is acceptable for user-facing errors in pages.

## Dependencies

### Internal
- `src/components/` — shared UI
- `src/lib/` — data/service singletons

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
