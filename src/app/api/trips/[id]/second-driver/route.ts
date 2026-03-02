import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { z } from 'zod';

const updateSecondDriverSchema = z.object({
    secondDriverName: z.string().min(1, 'Le nom du 2ème conducteur est requis'),
    secondDriverEmail: z.string().email().optional().or(z.literal('')),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = updateSecondDriverSchema.parse(body);

        // Verify if user is admin or is the primary driver for this trip
        const tripRes = await db.execute({
            sql: `SELECT driverEmail FROM Trip WHERE id = ?`,
            args: [id]
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        const isAdmin = session.user.roles?.includes('ADMIN');
        const isPrimaryDriver = session.user.email === tripRes.rows[0].driverEmail;

        if (!isAdmin && !isPrimaryDriver) {
            return NextResponse.json({ error: 'Non autorisé à modifier ce trajet' }, { status: 403 });
        }

        await db.execute({
            sql: `UPDATE Trip SET secondDriverName = ?, secondDriverEmail = ? WHERE id = ?`,
            args: [
                data.secondDriverName,
                data.secondDriverEmail || null,
                id
            ]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error updating second driver:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'ajout du 2ème conducteur" },
            { status: 500 }
        );
    }
}
