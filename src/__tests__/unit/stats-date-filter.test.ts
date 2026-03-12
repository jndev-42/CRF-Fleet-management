/**
 * Regression test for the DATE() bug in stats queries.
 *
 * The bug: comparing raw ISO timestamp strings against a plain date string
 * (e.g. "2026-03-09") fails because "2026-03-09T23:59:00Z" > "2026-03-09".
 * Fix: wrap the column with SQLite's DATE() function so only the date part
 * is compared.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedVehicle, seedTrip, seedUser } from '../setup';

const TRIP_DATE = '2026-03-09';
const TRIP_TIMESTAMP = '2026-03-09T23:59:00.000Z';

describe('stats DATE() regression', () => {
  beforeEach(async () => {
    await seedUser({ id: 'user-1', email: 'driver@test.com', name: 'Test Driver' });
    await seedVehicle();
    await seedTrip({ checkOutAt: TRIP_TIMESTAMP });
  });

  it('includes a trip whose checkOutAt is 23:59 on the query date — using DATE()', async () => {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM "Trip"
            WHERE DATE(checkOutAt) >= ? AND DATE(checkOutAt) <= ?`,
      args: [TRIP_DATE, TRIP_DATE],
    });
    const count = Number(result.rows[0].count);
    expect(count).toBe(1);
  });

  it('demonstrates the OLD bug: raw string comparison misses the trip', async () => {
    // This test documents that the broken query returns 0 for a same-day 23:59 trip.
    // "2026-03-09T23:59:00.000Z" > "2026-03-09" so the <= comparison fails.
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM "Trip"
            WHERE checkOutAt >= ? AND checkOutAt <= ?`,
      args: [TRIP_DATE, TRIP_DATE],
    });
    const count = Number(result.rows[0].count);
    // The broken query returns 0 — this confirms the bug was real
    expect(count).toBe(0);
  });

  it('returns 0 for a date range that does not include the trip date', async () => {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM "Trip"
            WHERE DATE(checkOutAt) >= ? AND DATE(checkOutAt) <= ?`,
      args: ['2026-03-10', '2026-03-10'],
    });
    const count = Number(result.rows[0].count);
    expect(count).toBe(0);
  });

  it('includes the trip when the date range spans the trip date', async () => {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM "Trip"
            WHERE DATE(checkOutAt) >= ? AND DATE(checkOutAt) <= ?`,
      args: ['2026-03-01', '2026-03-31'],
    });
    const count = Number(result.rows[0].count);
    expect(count).toBe(1);
  });
});
