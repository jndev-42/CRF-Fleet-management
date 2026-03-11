# Tests (Vitest)

Run: `npm run test` | Watch: `npm run test:watch` | UI: `npm run test:ui`

## Structure
```
unit/        — pure functions, no DB, no network
components/  — React Testing Library, no DB
integration/ — real SQLite DB (from ./setup.ts), mocked auth + external services
```

## Integration tests — critical rules
- **Never mock the DB.** Use the real SQLite file from `./setup.ts`. Past incidents: mock/prod divergence masked real bugs.
- **Always mock auth** (`@/auth`) and external services (`@/lib/renault`, `@/lib/onesignal`, `@/lib/drive`).
- Mocks must be **hoisted** — `vi.mock(...)` calls go at the top before any imports:
  ```ts
  vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
  });
  vi.mock('@/auth', () => ({ auth: vi.fn() }));
  ```

## Auth mock pattern
```ts
import { auth } from '@/auth';
const mockedAuth = vi.mocked(auth);

// In test:
mockedAuth.mockResolvedValue({ user: { email: 'test@dev.local', roles: ['CHVL'] } });
// Unauthenticated:
mockedAuth.mockResolvedValue(null);
```

## Request factory
```ts
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

## What to test (priority)
1. **401** when no session — every POST/PATCH/DELETE route
2. **403** when wrong role
3. **400** for Zod validation failures (missing required fields, wrong types)
4. **Happy path** — correct status code + DB side effect verified
5. **Business rules** — e.g., mileageIn ≥ mileageOut, vehicle status transition

## Unit tests
Keep pure — import the function, test inputs/outputs, no mocking needed.
Stats functions in `src/lib/stats.ts` must have unit test coverage.
