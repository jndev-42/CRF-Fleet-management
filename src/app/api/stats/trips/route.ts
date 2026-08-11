import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { isInactive } from '@/lib/roles';

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

        // Seuls les rôles actifs (non INACTIF/GUEST) peuvent accéder aux stats
        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (isInactive(roles)) {
            return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
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

        // Validate date range (max 62 days, consistent with /api/stats)
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays < 0) {
            return NextResponse.json({ error: 'La date de début doit être antérieure à la date de fin.' }, { status: 400 });
        }
        if (diffDays > 62) {
            return NextResponse.json({ error: 'La plage de dates est limitée à 62 jours.' }, { status: 400 });
        }

        const ulId = session.user.ulId as string | undefined;
        if (!ulId || ulId === 'default') {
            return NextResponse.json({ trips: [] });
        }

        const result = await db.execute({
            sql: `SELECT
                    t.id,
                    t.checkOutAt,
                    t.checkInAt,
                    t.driverId,
                    u.name  AS driverName,
                    u.email AS driverEmail,
                    u2.name  AS secondDriverName,
                    u2.email AS secondDriverEmail,
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
                  JOIN "User" u ON u.id = t.driverId
                  LEFT JOIN "User" u2 ON u2.id = t.secondDriverId
                  WHERE DATE(t.checkOutAt) >= ? AND DATE(t.checkOutAt) <= ?
                    AND v.ulId = ?
                  ORDER BY t.checkOutAt DESC`,
            args: [dateFrom, dateTo, ulId],
        });

        return NextResponse.json({ trips: result.rows });

    } catch (error) {
        console.error('[GET /api/stats/trips]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}