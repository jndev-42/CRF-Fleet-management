import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { z } from 'zod';
import { isAdminOrAbove } from '@/lib/roles';

const desinfPreSchema = z.object({
    desinfResponsableId: z.string().min(1, 'L\'identifiant du responsable est requis'),
    desinfResponsable: z.string().min(1, 'Le nom du responsable est requis'),
    desinfLotNumber: z.string().min(1, 'Le numéro de lot est requis'),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = session.user.roles || ['GUEST'];
        if (!isAdminOrAbove(roles)) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = desinfPreSchema.parse(body);

        // Fetch the trip
        const tripRes = await db.execute({
            sql: `SELECT id, checkInAt, missionType FROM Trip WHERE id = ?`,
            args: [id],
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        const trip = tripRes.rows[0];

        if (trip.checkInAt !== null) {
            return NextResponse.json({ error: 'Ce trajet a déjà été rendu' }, { status: 400 });
        }

        if (trip.missionType !== 'Désinfection') {
            return NextResponse.json({ error: 'Ce trajet n\'est pas une mission de désinfection' }, { status: 400 });
        }

        await db.execute({
            sql: `UPDATE Trip SET desinfResponsableId = ?, desinfResponsable = ?, desinfLotNumber = ? WHERE id = ?`,
            args: [data.desinfResponsableId, data.desinfResponsable, data.desinfLotNumber, id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error saving desinf pre-checkin data:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la sauvegarde des informations de désinfection' },
            { status: 500 }
        );
    }
}
