import sharp from 'sharp';

/**
 * Compresse et normalise une image de tampon d'UL en PNG (max 400x200, ~15-25 Ko max).
 * Garantit que la taille en BDD reste ultra-légère pour des requêtes instantanées.
 */
export async function compressStampImage(input: string | null | undefined): Promise<string | null> {
    if (!input || typeof input !== 'string' || !input.trim()) return null;
    try {
        let buffer: Buffer | null = null;
        if (input.startsWith('data:')) {
            const parts = input.split(',');
            if (parts.length > 1) {
                buffer = Buffer.from(parts[1], 'base64');
            }
        }
        if (!buffer) return input;

        const compressedPng = await sharp(buffer)
            .resize(400, 200, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png({ quality: 85, compressionLevel: 9 })
            .toBuffer();

        return `data:image/png;base64,${compressedPng.toString('base64')}`;
    } catch (err) {
        console.error('Erreur lors de la compression serveur du tampon:', err);
        return input;
    }
}
