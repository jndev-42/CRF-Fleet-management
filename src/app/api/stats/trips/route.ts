import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const querySchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    const result = await db.execute({
      sql: `SELECT
              t.id,
              t.checkOutAt,
              t.checkInAt,
              t.driverName,
              t.driverEmail,
              t.secondDriverName,
              t.secondDriverEmail,
              v.name  AS vehicleName,
              v.plate AS vehiclePlate,
              t.missionType,
              t.missionName,
              t.mileageOut,
              t.mileageIn,
              t.fuelOut,
              t.fuelIn,
              t.conditionOut,
              t.conditionIn,
              t.cleanlinessOut,
              t.cleanlinessIn,
              t.parkingOut,
              t.parkingIn,
              t.dsaChecked,
              t.incident,
              t.commentsOut,
              t.commentsIn
            FROM Trip t
            JOIN Vehicle v ON v.id = t.vehicleId
            WHERE DATE(t.checkOutAt) >= ? AND DATE(t.checkOutAt) <= ?
            ORDER BY t.checkOutAt DESC`,
      args: [dateFrom, dateTo],
    });

    return NextResponse.json({ trips: result.rows });
  } catch (error) {
    console.error('[GET /api/stats/trips]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
