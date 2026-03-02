import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

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

        await db.execute({
            sql: `DELETE FROM Trip WHERE vehicleId = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing vehicle trips:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression de l\'historique' },
            { status: 500 }
        );
    }
}
