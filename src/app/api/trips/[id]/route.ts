import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
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

        // Find the trip to check if it has a drive folder or is currently active
        const tripRes = await db.execute({
            sql: `SELECT vehicleId, checkInAt, driveFolderId FROM Trip WHERE id = ?`,
            args: [id]
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ success: true });
        }

        const trip = tripRes.rows[0];

        if (trip.driveFolderId) {
            // Do not block deletion if drive folder fails to delete (e.g. already deleted manually)
            try {
                await deleteDriveFolder(trip.driveFolderId as string);
            } catch (err) {
                console.error("Failed to delete drive folder, continuing:", err);
            }
        }

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `DELETE FROM Trip WHERE id = ?`,
                args: [id],
            });

            // If the deleted trip was active, ensure the vehicle goes back to AVAILABLE
            // (Only if there are no other active trips left for that vehicle)
            if (!trip.checkInAt) {
                const activeTripsRes = await tx.execute({
                    sql: `SELECT COUNT(*) as cnt FROM Trip WHERE vehicleId = ? AND checkInAt IS NULL`,
                    args: [trip.vehicleId as string]
                });
                if (activeTripsRes.rows[0].cnt === 0) {
                    await tx.execute({
                        sql: `UPDATE Vehicle SET status = 'AVAILABLE' WHERE id = ? AND status = 'IN_USE'`,
                        args: [trip.vehicleId as string]
                    });
                }
            }

            await tx.commit();
        } catch (txError) {
            await tx.rollback();
            throw txError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting trip:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du trajet' },
            { status: 500 }
        );
    }
}
