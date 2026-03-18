import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import type { DesinfectionRecord } from '@/app/vehicles/[id]/types';

/**
 * GET /api/vehicles/[id]/desinfections
 *
 * Retourne la main courante des désinfections pour un véhicule VPSP.
 * [id] est le nom du véhicule (même convention que les autres routes vehicles/[id]).
 * Seules les sorties complètes (avec checkInAt) de type "Désinfection" sont retournées.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;

        // Résoudre l'UUID du véhicule à partir de son nom
        const vehicleResult = await db.execute({
            sql: `SELECT id FROM "Vehicle" WHERE name = ?`,
            args: [id],
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id as string;

        const result = await db.execute({
            sql: `SELECT t.id, t.checkOutAt, t.checkInAt, t.desinfResponsable, t.desinfLotNumber,
                         u.name AS driverName
                  FROM "Trip" t
                  JOIN "User" u ON u.id = t.driverId
                  WHERE t.vehicleId = ?
                    AND t.missionType = 'Désinfection'
                    AND t.checkInAt IS NOT NULL
                  ORDER BY t.checkInAt DESC`,
            args: [vehicleId],
        });

        const desinfections: DesinfectionRecord[] = result.rows.map(row => ({
            id: row.id as string,
            checkOutAt: row.checkOutAt as string,
            checkInAt: row.checkInAt as string,
            desinfResponsable: row.desinfResponsable as string | null,
            desinfLotNumber: row.desinfLotNumber as string | null,
            driverName: row.driverName as string | null,
        }));

        return NextResponse.json({ desinfections });
    } catch (error) {
        console.error('Error fetching desinfections:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération de l\'historique de désinfection' },
            { status: 500 }
        );
    }
}
