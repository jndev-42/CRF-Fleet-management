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

        // Find the trip to check if it has a drive folder to delete
        const tripRes = await db.execute({
            sql: `SELECT driveFolderId FROM Trip WHERE id = ?`,
            args: [id]
        });

        if (tripRes.rows.length > 0 && tripRes.rows[0].driveFolderId) {
            await deleteDriveFolder(tripRes.rows[0].driveFolderId as string);
        }

        await db.execute({
            sql: `DELETE FROM Trip WHERE id = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting trip:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du trajet' },
            { status: 500 }
        );
    }
}
