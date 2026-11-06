/**
 * Photo d'un véhicule — normalisation et restitution, côté serveur uniquement.
 *
 * Partagé par `/api/vehicles/[id]/photo` (contrôle d'UL) et `/api/qr/[token]/photo`
 * (parcours QR) : seuls les contrôles d'accès diffèrent.
 */

import { NextResponse } from 'next/server';
import { hasAcceptedPhotoSignature } from '@/lib/vehiclePhoto';
import { getErrorMessage } from '@/lib/utils/error';

const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 82;

/**
 * JPEG à l'endroit, 1600 px max sans agrandissement. `sharp` ne recopie aucune
 * métadonnée par défaut : la position GPS d'une photo de téléphone n'est jamais conservée.
 * Renvoie `null` si le fichier n'est pas une image JPEG, PNG ou WebP lisible.
 */
export async function normalizeVehiclePhoto(input: Buffer): Promise<Buffer | null> {
    if (!hasAcceptedPhotoSignature(input)) return null;

    // Import paresseux : la lecture d'une photo (bien plus fréquente) n'en a pas besoin.
    const { default: sharp } = await import('sharp');
    try {
        return await sharp(input)
            .rotate() // sans argument : applique l'orientation EXIF
            .resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' }) // la transparence d'un PNG deviendrait noire en JPEG
            .jpeg({ quality: JPEG_QUALITY })
            .toBuffer();
    } catch (error: unknown) {
        console.error('[vehicle-photo] image illisible :', getErrorMessage(error));
        return null;
    }
}

export async function vehiclePhotoResponse(row: Record<string, unknown>): Promise<NextResponse> {
    const key = (row.photoR2Key as string | null) || null;
    if (!key) {
        return NextResponse.json({ error: 'Aucune photo pour ce véhicule' }, { status: 404 });
    }

    const { getObject } = await import('@/lib/r2');
    const buffer = await getObject(key);
    if (!buffer) {
        // La base référence une clé absente du bucket : anomalie à faire remonter.
        console.error(`[vehicle-photo] objet R2 introuvable pour le véhicule ${String(row.id)} : ${key}`);
        return NextResponse.json({ error: 'La photo est introuvable. Contactez un administrateur.' }, { status: 409 });
    }

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(buffer.length),
            // L'URL est versionnée (`?v=<photoUpdatedAt>`) : un remplacement en change.
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
