# /page-template

Boilerplate for new pages in `src/app/`.

## Standard page structure
```ts
'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Data fetch — only when authenticated
  useEffect(() => {
    if (status === 'authenticated') fetchData();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'unauthenticated') return null;
  if (loading || status === 'loading') return <PageSkeleton />;
  return (/* JSX */);
}
```

## Roles from session
```ts
const roles = (session?.user?.roles || ['GUEST']) as string[];
const isAdmin = roles.includes('ADMIN');
```
No DB lookup needed — roles are in the JWT.

## Notes
- All pages are currently Client Components (`'use client'`). Server Component migration is planned (M-4) but not started — don't convert yet.
- Pages use **global CSS classes**: `page-header`, `page-title`, `filters-bar`, `filter-btn`, `card`, etc.
- Keep page files under ~150 lines. Extract data fetching to custom hooks (`useDashboardData`, `useVehicleList`).
