<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# __tests__

## Purpose
Vitest test suite: unit tests, React Testing Library component tests, and integration tests against a real SQLite DB.

## Key Files
| File | Description |
|------|-------------|
| `setup.ts` | Real SQLite test DB setup, imported by integration tests |
| `inventory-rework.test.ts` | Inventory rework regression suite |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `unit/` | Pure functions, no DB, no network |
| `components/` | React Testing Library, no DB |
| `integration/` | Real SQLite DB (from `./setup.ts`), mocked auth + external services |

## For AI Agents

### Working In This Directory
Run: `npm run test` | Watch: `npm run test:watch` | UI: `npm run test:ui`

**Integration tests — critical rules:**
- **Never mock the DB.** Use the real SQLite file from `./setup.ts`. Past incident: mock/prod divergence masked real bugs.
- **Always mock auth** (`@/auth`) and external services (`@/lib/renault`, `@/lib/onesignal`, `@/lib/drive`).
- Mocks must be **hoisted** — `vi.mock(...)` calls go at the top before any imports:
```ts
vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
```

**Auth mock pattern:**
```ts
import { auth } from '@/auth';
const mockedAuth = vi.mocked(auth);
mockedAuth.mockResolvedValue({ user: { email: 'test@dev.local', roles: ['CHVL'] } });
mockedAuth.mockResolvedValue(null); // Unauthenticated
```

**Request factory:**
```ts
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

### What to test (priority)
1. **401** when no session — every POST/PATCH/DELETE route
2. **403** when wrong role
3. **400** for Zod validation failures
4. **Happy path** — correct status code + DB side effect verified
5. **Business rules** — e.g., mileageIn ≥ mileageOut, vehicle status transition

### Unit tests
Keep pure — import the function, test inputs/outputs, no mocking needed. Stats functions in `src/lib/stats.ts` must have unit test coverage.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
