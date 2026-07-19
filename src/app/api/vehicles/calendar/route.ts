import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const ulId = session.user.ulId;
    if (!ulId || ulId === 'default') {
      return NextResponse.json({ vehicles: [], reservations: [], trips: [] });
    }

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month'); // e.g. "2026-07"
    const vehicleIdParam = searchParams.get('vehicleId'); // optional filter

    let targetDate = new Date();
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split('-').map(Number);
      targetDate = new Date(year, month - 1, 1);
    }

    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed

    // Calculate window range (including margin for week padding)
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Padding 7 days before and after
    const windowStart = new Date(firstDayOfMonth);
    windowStart.setDate(windowStart.getDate() - 7);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(lastDayOfMonth);
    windowEnd.setDate(windowEnd.getDate() + 7);
    windowEnd.setHours(23, 59, 59, 999);

    const windowStartISO = windowStart.toISOString();
    const windowEndISO = windowEnd.toISOString();

    // 1. Fetch vehicles
    let vehiclesSql = `SELECT id, name, plate, type, status FROM Vehicle WHERE ulId = ?`;
    const vehiclesArgs: (string | null)[] = [ulId];
    if (vehicleIdParam) {
      vehiclesSql += ` AND id = ?`;
      vehiclesArgs.push(vehicleIdParam);
    }
    vehiclesSql += ` ORDER BY name ASC`;

    const vehiclesResult = await db.execute({
      sql: vehiclesSql,
      args: vehiclesArgs,
    });

    const vehicles = vehiclesResult.rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      plate: row.plate as string,
      type: row.type as string,
      status: row.status as string,
    }));

    // If vehicleIdParam specified, use it for filtering
    const vehicleFilterClause = vehicleIdParam ? ` AND v.id = '${vehicleIdParam}'` : '';

    // 2. Fetch reservations
    const reservationsSql = `
      SELECT
        r.id, r.vehicleId, v.name as vehicleName, v.plate as vehiclePlate,
        r.userEmail, r.userName, r.startTime, r.endTime, r.reason, r.status, r.createdAt
      FROM "Reservation" r
      JOIN Vehicle v ON r.vehicleId = v.id
      WHERE v.ulId = ? ${vehicleFilterClause}
        AND r.startTime <= ?
        AND r.endTime >= ?
      ORDER BY r.startTime ASC
    `;

    const reservationsResult = await db.execute({
      sql: reservationsSql,
      args: [ulId, windowEndISO, windowStartISO],
    });

    const reservations = reservationsResult.rows.map(row => ({
      id: row.id as string,
      vehicleId: row.vehicleId as string,
      vehicleName: row.vehicleName as string,
      vehiclePlate: row.vehiclePlate as string,
      userEmail: row.userEmail as string,
      userName: row.userName as string,
      startTime: row.startTime as string,
      endTime: row.endTime as string,
      reason: row.reason as string | null,
      status: (row.status as string) || 'PENDING',
      createdAt: row.createdAt as string,
    }));

    // 3. Fetch trips (borrowings)
    const tripsSql = `
      SELECT
        t.id, t.vehicleId, v.name as vehicleName, v.plate as vehiclePlate,
        u.name as driverName, u2.name as secondDriverName,
        t.missionType, t.missionName, t.checkOutAt, t.checkInAt, t.createdAt
      FROM Trip t
      JOIN Vehicle v ON t.vehicleId = v.id
      LEFT JOIN User u ON u.id = t.driverId
      LEFT JOIN User u2 ON u2.id = t.secondDriverId
      WHERE v.ulId = ? ${vehicleFilterClause}
        AND t.checkOutAt <= ?
        AND (t.checkInAt >= ? OR t.checkInAt IS NULL)
      ORDER BY t.checkOutAt ASC
    `;

    const tripsResult = await db.execute({
      sql: tripsSql,
      args: [ulId, windowEndISO, windowStartISO],
    });

    const trips = tripsResult.rows.map(row => ({
      id: row.id as string,
      vehicleId: row.vehicleId as string,
      vehicleName: row.vehicleName as string,
      vehiclePlate: row.vehiclePlate as string,
      driverName: (row.driverName as string | null) || 'Conducteur inconnu',
      secondDriverName: row.secondDriverName as string | null,
      missionType: row.missionType as string,
      missionName: row.missionName as string | null,
      checkOutAt: row.checkOutAt as string,
      checkInAt: row.checkInAt as string | null,
      isOngoing: !row.checkInAt,
      createdAt: row.createdAt as string,
    }));

    return NextResponse.json({
      month: monthParam || `${year}-${String(month + 1).padStart(2, '0')}`,
      vehicles,
      reservations,
      trips,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching calendar data:', errorMessage);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des données du calendrier', detail: errorMessage },
      { status: 500 }
    );
  }
}
