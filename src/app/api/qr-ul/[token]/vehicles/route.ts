import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/qr-ul/[token]/vehicles
 *
 * Véhicules de l'UL du QR code, pour l'étape « Équipage » du rapport de mission déposé
 * par QR (`/qr-ul/[token]`). `GET /api/vehicles` renvoie les véhicules de l'UL de la
 * SESSION : un bénévole d'une autre UL (ou sans UL) qui scanne le QR voyait ses propres
 * véhicules, ou aucun, au lieu de ceux de l'UL dont il rédige le rapport.
 *
 * Accès : règles QR — tout compte connecté sauf INACTIF/GUEST (`isQrBlocked`).
 * N'expose que `id`, `name`, `type`.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    if (isQrBlocked(session.user.roles || [])) {
        return forbiddenResponse('Compte inactif');
    }

    const { token } = await params;

    try {
        const ulRes = await db.execute({
            sql: `SELECT id FROM "UniteLocale" WHERE qrToken = ?`,
            args: [token],
        });
        if (ulRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const vehiclesRes = await db.execute({
            sql: `SELECT id, name, type FROM Vehicle WHERE ulId = ? ORDER BY name COLLATE NOCASE ASC`,
            args: [ulRes.rows[0].id as string],
        });
        const vehicles = vehiclesRes.rows.map(row => ({
            id: row.id as string,
            name: row.name as string,
            type: (row.type as string | null) ?? null,
        }));

        return NextResponse.json({ vehicles });
    } catch (error) {
        console.error('Error fetching UL QR vehicles:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des véhicules' }, { status: 500 });
    }
}
