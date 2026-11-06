import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { vehiclePhotoResponse } from '@/lib/vehiclePhotoServer';

// Lecture R2 et Buffer : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/qr/[token]/photo
 *
 * Photo du véhicule désigné par le QR code.
 * Mêmes droits que `/api/qr/[token]/vehicle` : tout compte connecté non bloqué
 * par `isQrBlocked`, sans contrôle d'UL ni de rôle (bypass QR).
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
        const res = await db.execute({
            sql: `SELECT id, photoR2Key FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });
        const vehicle = res.rows[0];
        if (!vehicle) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        return await vehiclePhotoResponse(vehicle);
    } catch (error: unknown) {
        console.error('[GET /api/qr/[token]/photo]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
