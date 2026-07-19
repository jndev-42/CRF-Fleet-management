import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { deleteDriveFolder } from '@/lib/drive';
import { isAdminOrAbove } from '@/lib/roles';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!isAdminOrAbove(session?.user?.roles || [])) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { id } = await params;

        // Fetch all trips for this vehicle to delete their Drive folders
        const tripsRes = await db.execute({
            sql: `SELECT driveFolderId FROM Trip WHERE vehicleId = ?`,
            args: [id]
        });

        const foldersToDelete = tripsRes.rows
            .map(row => row.driveFolderId as string)
            .filter(Boolean);

        if (foldersToDelete.length > 0) {
            await Promise.allSettled(foldersToDelete.map(folderId => deleteDriveFolder(folderId)));
        }

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `DELETE FROM Trip WHERE vehicleId = ?`,
                args: [id],
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'AVAILABLE' WHERE id = ? AND status = 'IN_USE'`,
                args: [id]
            });

            await tx.commit();
        } catch (txError) {
            await tx.rollback();
            throw txError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing vehicle trips:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression de l\'historique' },
            { status: 500 }
        );
    }
}
