import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const updateVehicleSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    plate: z.string().min(1).optional(),
    status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE']).optional(),
    parkingSpot: z.string().optional().nullable(),
    fuelLevel: z.number().min(0).max(100).optional(),
    mileage: z.number().min(0).optional(),
    hasDSA: z.boolean().optional(),
    notes: z.string().optional().nullable(),
    vin: z.string().optional().nullable(),
    fuelType: z.string().optional().nullable(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;

        // Fetch vehicle by name since [id] is now the vehicle name
        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE name = ?`,
            args: [id]
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        const row = vehicleResult.rows[0];

        // Fetch trips using the actual vehicle UUID — JOIN User to get display name/email
        const tripsResult = await db.execute({
            sql: `SELECT t.*,
                         u.name  AS driverName,
                         u.email AS driverEmail,
                         u2.name  AS secondDriverName,
                         u2.email AS secondDriverEmail
                  FROM Trip t
                  JOIN "User" u ON u.id = t.driverId
                  LEFT JOIN "User" u2 ON u2.id = t.secondDriverId
                  WHERE t.vehicleId = ?
                  ORDER BY t.checkOutAt DESC LIMIT 20`,
            args: [row.id]
        });

        const vehicle = {
            id: row.id,
            name: row.name,
            type: row.type,
            plate: row.plate,
            status: row.status,
            parkingSpot: row.parkingSpot,
            fuelLevel: row.fuelLevel,
            mileage: row.mileage,
            hasDSA: !!row.hasDSA,
            notes: row.notes,
            vin: row.vin,
            fuelType: row.fuelType,
            createdAt: new Date(row.createdAt as string),
            updatedAt: new Date(row.updatedAt as string),
            trips: tripsResult.rows.map((tRow) => ({
                id: tRow.id,
                vehicleId: tRow.vehicleId,
                driverId: tRow.driverId,
                secondDriverId: tRow.secondDriverId || null,
                driverName: tRow.driverName || null,
                driverEmail: tRow.driverEmail || null,
                secondDriverName: tRow.secondDriverName || null,
                secondDriverEmail: tRow.secondDriverEmail || null,
                missionType: tRow.missionType,
                missionName: tRow.missionName,
                checkOutAt: new Date(tRow.checkOutAt as string),
                mileageOut: tRow.mileageOut,
                fuelOut: tRow.fuelOut,
                conditionOut: tRow.conditionOut,
                cleanlinessOut: tRow.cleanlinessOut || null,
                parkingOut: tRow.parkingOut,
                dsaChecked: !!tRow.dsaChecked,
                commentsOut: tRow.commentsOut,
                checkInAt: tRow.checkInAt ? new Date(tRow.checkInAt as string) : null,
                mileageIn: tRow.mileageIn,
                fuelIn: tRow.fuelIn,
                conditionIn: tRow.conditionIn,
                cleanlinessIn: tRow.cleanlinessIn || null,
                parkingIn: tRow.parkingIn,
                incident: tRow.incident,
                commentsIn: tRow.commentsIn,
                parkingPhoto: tRow.parkingPhoto,
                driveFolderId: tRow.driveFolderId || null,
                renaultDataValidated: tRow.renaultDataValidated ?? null,
                renaultLastCheckedAt: tRow.renaultLastCheckedAt || null,
                createdAt: new Date(tRow.createdAt as string),
            }))
        };

        return NextResponse.json(vehicle);
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du véhicule' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = updateVehicleSchema.parse(body);

        // Fetch the current vehicle state (UUID + hasDSA) so we can sync DSA checklist items
        const currentVehicleRes = await db.execute({
            sql: `SELECT id, hasDSA FROM Vehicle WHERE name = ?`,
            args: [id]
        });
        const currentVehicle = currentVehicleRes.rows[0] ?? null;
        const vehicleUuid = currentVehicle?.id as string | undefined;
        const previousHasDSA = currentVehicle ? !!currentVehicle.hasDSA : null;

        const setClauses = [];
        const args = [];
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                setClauses.push(`${key} = ?`);
                args.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
            }
        }

        let vehicle = null;
        if (setClauses.length > 0) {
            const timestamp = new Date().toISOString();
            setClauses.push(`updatedAt = ?`);
            args.push(timestamp);
            args.push(id);

            await db.execute({
                sql: `UPDATE Vehicle SET ${setClauses.join(', ')} WHERE name = ?`,
                args
            });

            vehicle = { id, ...data, updatedAt: timestamp };
        }

        // Sync DSA checklist items when hasDSA changes
        if (vehicleUuid && data.hasDSA !== undefined && data.hasDSA !== previousHasDSA) {
            const now = new Date().toISOString();
            if (data.hasDSA) {
                // hasDSA changed false → true: insert DSA checkout checklist item (optional)
                const dsaId = `dsa-checkout-${vehicleUuid}`;
                const exists = await db.execute({
                    sql: `SELECT 1 FROM "VehicleChecklistItem" WHERE id = ?`,
                    args: [dsaId]
                });
                if (exists.rows.length === 0) {
                    await db.execute({
                        sql: `INSERT INTO "VehicleChecklistItem" (id, vehicleId, label, type, required, "order", createdAt)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        args: [dsaId, vehicleUuid, "J'ai vérifié le DSA", 'checkout', 0, 0, now]
                    });
                }
            } else {
                // hasDSA changed true → false: remove DSA checkout checklist item
                await db.execute({
                    sql: `DELETE FROM "VehicleChecklistItem" WHERE id = ?`,
                    args: [`dsa-checkout-${vehicleUuid}`]
                });
            }
        }

        return NextResponse.json(vehicle);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error updating vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du véhicule' },
            { status: 500 }
        );
    }
}

import { deleteDriveFolder } from '@/lib/drive';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { id } = await params;

        // Find the vehicle by name first to get its UUID
        const vehicleResult = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE name = ?`,
            args: [id]
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        const realId = vehicleResult.rows[0].id;

        // Fetch trips to delete their associated Drive folders
        const tripsRes = await db.execute({
            sql: `SELECT driveFolderId FROM Trip WHERE vehicleId = ?`,
            args: [realId]
        });

        const foldersToDelete = tripsRes.rows
            .map(row => row.driveFolderId as string)
            .filter(Boolean);

        if (foldersToDelete.length > 0) {
            await Promise.allSettled(foldersToDelete.map(folderId => deleteDriveFolder(folderId)));
        }

        // Delete all trips associated with the vehicle first
        await db.execute({
            sql: `DELETE FROM Trip WHERE vehicleId = ?`,
            args: [realId]
        });

        // Then delete the vehicle
        await db.execute({
            sql: `DELETE FROM Vehicle WHERE id = ?`,
            args: [realId]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du véhicule' },
            { status: 500 }
        );
    }
}
