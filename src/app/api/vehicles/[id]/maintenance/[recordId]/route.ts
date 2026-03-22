import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string; recordId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = session.user.roles || ['INACTIF'];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { id, recordId } = await params;

        // Resolve vehicle by name to get its UUID
        const vehicleResult = await db.execute({
            sql: `SELECT id FROM "Vehicle" WHERE name = ?`,
            args: [id],
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id as string;

        // Verify the record belongs to this vehicle
        const recordResult = await db.execute({
            sql: `SELECT id FROM "VehicleMaintenanceRecord" WHERE id = ? AND vehicleId = ?`,
            args: [recordId, vehicleId],
        });

        if (recordResult.rows.length === 0) {
            return NextResponse.json({ error: 'Enregistrement non trouvé' }, { status: 404 });
        }

        await db.execute({
            sql: `DELETE FROM "VehicleMaintenanceRecord" WHERE id = ?`,
            args: [recordId],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting maintenance record:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression de l\'enregistrement' },
            { status: 500 }
        );
    }
}
