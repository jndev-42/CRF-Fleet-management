<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Unit Tests

## Purpose
Pure function tests with no database, no network, no React rendering. Tests for utility functions, validation helpers, auth callbacks, stats calculations, and date filtering logic.

## Key Files
| File | Description |
|------|-------------|
| `error.test.ts` | Tests for `src/lib/utils/error.ts::getErrorMessage()` |
| `stats-lib.test.ts` | Tests for stats calculation functions in `src/lib/stats.ts` |
| `stats-date-filter.test.ts` | Tests for date range filtering helpers |
| `roles.test.ts` | Tests for role-based access control predicates |
| `authCallbacks.test.ts` | Tests for NextAuth callback logic (jwt, session, signIn) |
| `zod-schemas.test.ts` | Tests for Zod schema validation |
| `upload-validation.test.ts` | Tests for photo upload validation rules |
| `imageCompression.test.ts` | Tests for image compression utility |
| `maintenanceUtils.test.ts` | Tests for maintenance calculation helpers |
| `bugReportLogger.test.ts` | Tests for bug report logging utility |
| `fun-factor.test.ts` | Tests for fun-factor calculation logic |

## For AI Agents

### Working In This Directory
- Tests use Vitest syntax (`describe`, `it`, `expect`, `vi.mock()`)
- No database mocking — these are 100% pure functions with no side effects
- No React Testing Library or jsdom — just Node.js + JavaScript
- Test organization: import function, call with various inputs, assert output
- When adding a new pure function or utility to `src/lib/`: write a unit test here
- Keep tests focused on behavior, not implementation details

### Test Coverage Priority
1. Edge cases and boundary conditions
2. Type validation (Zod schemas, TypeScript)
3. Error paths (invalid inputs, null/undefined)
4. Happy path
5. Complex calculations (stats aggregations, role resolution)

## Dependencies

### Internal
- Pure functions from `src/lib/` (stats.ts, utils/error.ts, etc.)
- NextAuth types for auth callback tests
- Zod for schema validation tests

