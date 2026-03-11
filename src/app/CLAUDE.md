# Pages (App Router)

All pages are **Client Components** (`'use client'`). Server Component migration is planned (M-4) but not started — don't convert yet.

## Standard structure
```ts
'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Data fetch — only when authenticated
  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]);

  if (status === 'unauthenticated') return null;
  if (loading || status === 'loading') return <PageSkeleton />;
  return (...);
}
```

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
```ts
const roles = (session?.user?.roles || ['GUEST']) as string[];
const isAdmin = roles.includes('ADMIN');
```
No DB lookup needed — roles are in the JWT.

## Error handling in fetch calls
Use `console.error(...)` for fetch errors. `alert()` is acceptable for user-facing errors in pages.
