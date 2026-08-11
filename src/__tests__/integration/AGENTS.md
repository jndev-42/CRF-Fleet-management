<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Integration Tests

## Purpose
Tests that require a real SQLite database (from `src/__tests__/setup.ts`), database schema, and API route handlers. Tests CRUD operations, business logic, authorization enforcement, and data integrity across the full stack. **Never mocks the database** — past incidents proved mock/prod divergence masks real bugs.

## Key Files
| File | Description |
|------|-------------|
| `checkout.test.ts` | Trip checkout (vehicle check-out, mission info, photos) |
| `checkin.test.ts` | Trip check-in (vehicle check-in, mileage/fuel, incident reports) |
| `vehicles.test.ts` | Vehicle CRUD, status tracking, reservation state |
| `missions.test.ts` | Mission creation, updates, deletion, visibility by role |
| `maintenance.test.ts` | Maintenance records (CT, revision), scheduling, validation |
| `reservations.test.ts` | Vehicle reservation flow, conflict detection, cancellation |
| `users.test.ts` | User authentication, role assignment, multi-UL access |
| `expense-stats.test.ts` | Trip expense aggregation and statistics |
| `stats-filters.test.ts` | Date range, vehicle, driver, mission-type filtering for reports |
| `ul-parking.test.ts` | UL-level parking spot defaults and overrides |
| `dt-view.test.ts` | DT (Délégué Territorial) view authorization and data filtering |
| `multi-stock.test.ts` | Inventory stock management across ULs |
| `calendar.test.ts` | Vehicle calendar view with availability and reservations |
| `vcard.test.ts` | vCard generation for contact exchange |
| `qr.test.ts` | QR code generation and trip linking |
| `editCheckOut.test.ts` | Editing trip check-out data post-submission |
| `bugReport.test.ts` | Bug report submission and logging |
| `repro_bug.test.ts` | Regression test for specific bug reproduction |
| `maintenanceEvents.test.ts` | Maintenance event triggering and reminders |

## For AI Agents

### Working In This Directory

**Critical Rules:**
- **Never mock the database.** Always use the real SQLite from `./setup.ts`. Mock/prod divergence has masked bugs before.
- **Always mock auth and external services:** `@/auth`, `@/lib/renault`, `@/lib/onesignal`, `@/lib/drive`
- **Hoisted mocks:** All `vi.mock()` calls must come at the top of the file before any imports

**Mock Pattern (Auth):**
```ts
import { auth } from '@/auth';
const mockedAuth = vi.mocked(auth);

// In test:
mockedAuth.mockResolvedValue({ user: { email: 'test@dev.local', roles: ['CHVL'] } });
// Unauthenticated:
mockedAuth.mockResolvedValue(null);
```

**Request Factory:**
```ts
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

**Test Coverage Priority:**
1. **401** — no session (every POST/PATCH/DELETE)
2. **403** — wrong role/UL
3. **400** — Zod validation (missing fields, wrong types)
4. **Happy path** — correct status + DB side effect verified
5. **Business rules** — mileageIn ≥ mileageOut, vehicle state transitions, orphan cleanup

### Notable Conventions
- Trip check-out requires vehicle ID, mission type, condition; returns trip ID
- Trip check-in requires mileage, fuel, condition; updates vehicle status to AVAILABLE
- Maintenance records are immutable after creation (no edits, only delete + recreate)
- Role-based queries filter on `user.roles` array — must use SQL IN or row-level filtering
- Multi-UL users see only vehicles/missions/trips in their assigned ULs
- Reservations conflict if date ranges overlap for same vehicle (after creation checks)

## Dependencies

### Internal
- Real DB from `./setup.ts` — creates schema, provides test client
- Mocked auth from `@/auth`
- Mocked external services: `@/lib/renault`, `@/lib/onesignal`, `@/lib/drive`
- API route handlers from `src/app/api/`
- Database schema files from `src/db/`

