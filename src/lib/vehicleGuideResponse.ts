/**
 * Restitution du guide de vérification d'un véhicule depuis R2.
 *
 * Partagée par `GET /api/vehicles/[id]/guide` (contrôle d'UL) et
 * `GET /api/qr/[token]/guide` (parcours QR) : seuls les contrôles d'accès
 * diffèrent, la lecture et les en-têtes doivent rester identiques.
 */

import { NextResponse } from 'next/server';
import { guideContentDisposition } from '@/lib/vehicleGuide';

export async function vehicleGuideResponse(
    row: Record<string, unknown>,
    download: boolean,
): Promise<NextResponse> {
    const key = (row.guideR2Key as string | null) || null;
    if (!key) {
        return NextResponse.json({ error: 'Aucun guide de vérification pour ce véhicule' }, { status: 404 });
    }

    const { getObject } = await import('@/lib/r2');
    const buffer = await getObject(key);
    if (!buffer) {
        // La base référence une clé absente du bucket : anomalie à faire remonter.
        console.error(`[vehicle-guide] objet R2 introuvable pour le véhicule ${String(row.id)} : ${key}`);
        return NextResponse.json({
            error: 'Le guide de vérification est introuvable. Contactez un administrateur.',
        }, { status: 409 });
    }

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': guideContentDisposition((row.guideFileName as string) || 'guide-verification.pdf', download),
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
