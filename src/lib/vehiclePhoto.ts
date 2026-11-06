/**
 * Photo d'un véhicule — règles partagées client / serveur.
 *
 * Module SANS dépendance serveur : le champ des modales et les vignettes
 * l'importent. `sharp` vit dans `vehiclePhotoServer.ts`, jamais ici.
 */

/** 4 Mo, comme annoncé à l'utilisateur : sous la limite de corps de requête Vercel (4,5 Mo). */
export const MAX_PHOTO_SIZE = 4 * 1024 * 1024;

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export const PHOTO_INVALID_ERROR = 'La photo doit être au format JPEG, PNG ou WebP.';
export const PHOTO_TOO_LARGE_ERROR = 'La photo est trop volumineuse (4 Mo maximum).';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
    return bytes.length >= offset + signature.length
        && signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Octets magiques JPEG, PNG ou WebP : le type et l'extension se falsifient
 * trivialement. Vérifié AVANT `sharp`, qui saurait aussi ouvrir du SVG ou du PDF.
 */
export function hasAcceptedPhotoSignature(bytes: Uint8Array): boolean {
    return startsWith(bytes, [0xff, 0xd8, 0xff]) // JPEG
        || startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG
        || (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)); // RIFF…WEBP
}

/**
 * URL de la photo, versionnée par sa date de dépôt : la réponse est mise en cache
 * 24 h, un remplacement doit donc changer d'URL pour s'afficher aussitôt.
 * `null` si le véhicule n'a pas de photo.
 */
export function vehiclePhotoUrl(base: string, updatedAt: string | null | undefined): string | null {
    return updatedAt ? `${base}?v=${encodeURIComponent(updatedAt)}` : null;
}

/** Retire la clé R2 d'une ligne `Vehicle` lue en `SELECT *` avant de la renvoyer au client. */
export function omitVehiclePhotoKey<T extends object>(row: T): Omit<T, 'photoR2Key'> {
    const copy: T & { photoR2Key?: unknown } = { ...row };
    delete copy.photoR2Key;
    return copy;
}
