import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const editCheckOutSchema = z.object({
    driverId: z.string().min(1, 'Le conducteur principal est requis'),
    secondDriverId: z.string().optional().nullable(),
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional().nullable(),
    mileageOut: z.number().int().min(0, 'Le kilométrage doit être positif'),
    fuelOut: z.number().int().min(0).max(100, 'Le niveau de carburant doit être entre 0 et 100'),
    parkingOut: z.string().optional().nullable(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional().nullable(),
    commentsOut: z.string().optional().nullable(),
    dsaChecked: z.boolean().optional(),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) {
            return forbiddenResponse();
        }

        const { id } = await params;

        // Check if trip exists and is currently active (checkInAt IS NULL)
        const tripRes = await db.execute({
            sql: `SELECT vehicleId, checkInAt FROM Trip WHERE id = ?`,
            args: [id]
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        const trip = tripRes.rows[0];
        if (trip.checkInAt !== null) {
            return NextResponse.json(
                { error: "Ce trajet n'est plus en cours d'emprunt" },
                { status: 400 }
            );
        }

        const body = await request.json();
        const data = editCheckOutSchema.parse(body);

        // Verify driver exists
        const driverRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE id = ?`,
            args: [data.driverId]
        });
        if (driverRes.rows.length === 0) {
            return NextResponse.json({ error: 'Conducteur principal introuvable' }, { status: 400 });
        }

        if (data.secondDriverId) {
            const secondDriverRes = await db.execute({
                sql: `SELECT id FROM "User" WHERE id = ?`,
                args: [data.secondDriverId]
            });
            if (secondDriverRes.rows.length === 0) {
                return NextResponse.json({ error: 'Deuxième conducteur introuvable' }, { status: 400 });
            }
        }

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `UPDATE Trip SET
                        driverId = ?,
                        secondDriverId = ?,
                        missionType = ?,
                        missionName = ?,
                        mileageOut = ?,
                        fuelOut = ?,
                        parkingOut = ?,
                        conditionOut = ?,
                        cleanlinessOut = ?,
                        commentsOut = ?,
                        dsaChecked = ?
                      WHERE id = ? AND checkInAt IS NULL`,
                args: [
                    data.driverId,
                    data.secondDriverId || null,
                    data.missionType,
                    data.missionName || null,
                    data.mileageOut,
                    data.fuelOut,
                    data.parkingOut || null,
                    data.conditionOut,
                    data.cleanlinessOut || null,
                    data.commentsOut || null,
                    data.dsaChecked ? 1 : 0,
                    id
                ]
            });

            // Update vehicle current mileage and fuelLevel while IN_USE
            await tx.execute({
                sql: `UPDATE Vehicle SET mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ? AND status = 'IN_USE'`,
                args: [data.mileageOut, data.fuelOut, new Date().toISOString(), trip.vehicleId as string]
            });

            await tx.commit();
        } catch (txErr) {
            await tx.rollback();
            throw txErr;
        }

        // Fetch updated trip details with driver names for response
        const updatedTripRes = await db.execute({
            sql: `SELECT t.*,
                         u.name AS driverName,
                         u.email AS driverEmail,
                         u2.name AS secondDriverName,
                         u2.email AS secondDriverEmail
                  FROM Trip t
                  JOIN "User" u ON u.id = t.driverId
                  LEFT JOIN "User" u2 ON u2.id = t.secondDriverId
                  WHERE t.id = ?`,
            args: [id]
        });

        const row = updatedTripRes.rows[0];
        const updatedTrip = {
            id: row.id,
            vehicleId: row.vehicleId,
            driverId: row.driverId,
            secondDriverId: row.secondDriverId || null,
            driverName: row.driverName || null,
            driverEmail: row.driverEmail || null,
            secondDriverName: row.secondDriverName || null,
            secondDriverEmail: row.secondDriverEmail || null,
            missionType: row.missionType,
            missionName: row.missionName || null,
            checkOutAt: row.checkOutAt,
            mileageOut: row.mileageOut,
            fuelOut: row.fuelOut,
            conditionOut: row.conditionOut,
            cleanlinessOut: row.cleanlinessOut || null,
            parkingOut: row.parkingOut || null,
            dsaChecked: !!row.dsaChecked,
            commentsOut: row.commentsOut || null,
            checkInAt: null,
        };

        return NextResponse.json(updatedTrip);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error updating active trip checkout details:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la modification des données de départ' },
            { status: 500 }
        );
    }
}
