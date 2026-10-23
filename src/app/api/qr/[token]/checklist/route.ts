import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/qr/[token]/checklist?type=checkout|checkin
 *
 * Checklist du véhicule désigné par un QR token, pour les formulaires QR.
 * Pendant de `GET /api/vehicles/[id]/checklist`, désormais cloisonné à l'UL de
 * session : le parcours QR, lui, reste ouvert entre ULs (le QR physique fait foi).
 * Accès : tout compte connecté sauf INACTIF (ou GUEST) — cf. `isQrBlocked`.
 */
export async function GET(
    request: Request,
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
    const type = new URL(request.url).searchParams.get('type');
    if (type !== null && type !== 'checkout' && type !== 'checkin') {
        return NextResponse.json({ error: 'Type de checklist invalide' }, { status: 400 });
    }

    try {
        const vehicleRes = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });
        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }
        const vehicleId = vehicleRes.rows[0].id as string;

        const rows = await db.execute({
            sql: `SELECT id, vehicleId, label, type, required, "order", createdAt
                  FROM "VehicleChecklistItem"
                  WHERE vehicleId = ? ${type ? 'AND type = ?' : ''}
                  ORDER BY "order" ASC, createdAt ASC`,
            args: type ? [vehicleId, type] : [vehicleId],
        });

        return NextResponse.json(rows.rows.map(r => ({
            id: r.id as string,
            vehicleId: r.vehicleId as string,
            label: r.label as string,
            type: r.type as 'checkout' | 'checkin',
            required: !!r.required,
            order: r.order as number,
            createdAt: r.createdAt as string,
        })));
    } catch (error) {
        console.error('Error fetching QR checklist items:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
