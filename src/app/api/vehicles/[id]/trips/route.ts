import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { deleteDriveFolder } from '@/lib/drive';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (!isAdminOrAbove(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const { id } = await params;

        const vehicleResult = await db.execute({
            sql: `SELECT ulId FROM Vehicle WHERE id = ?`,
            args: [id],
        });
        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        if (!isSuperAdmin(session.user.roles || []) && session.user.ulId !== vehicleResult.rows[0].ulId) {
            return forbiddenResponse();
        }

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
