import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { vehicleDocumentResponse } from '@/lib/vehicleDocuments/server';

// Lecture R2 et Buffer : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/qr/[token]/documents/[documentId]
 *
 * Document PDF du véhicule désigné par le QR code — `inline`, ou en
 * téléchargement avec `?download=1`. Le document n'est résolu que pour CE
 * véhicule : l'identifiant d'un document d'un autre véhicule donne un 404.
 * Mêmes droits que `/api/qr/[token]/vehicle` : tout compte connecté non bloqué
 * par `isQrBlocked`, sans contrôle d'UL ni de rôle (bypass QR).
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string; documentId: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    if (isQrBlocked(session.user.roles || [])) {
        return forbiddenResponse('Compte inactif');
    }

    const { token, documentId } = await params;

    try {
        const res = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });
        const vehicle = res.rows[0];
        if (!vehicle) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const download = new URL(request.url).searchParams.get('download') === '1';
        return await vehicleDocumentResponse(vehicle.id as string, documentId, download);
    } catch (error: unknown) {
        console.error('[GET /api/qr/[token]/documents/[documentId]]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
