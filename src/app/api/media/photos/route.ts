/**
 * GET /api/media/photos?folderId=<préfixe R2>[&flat=true] — liste les fichiers d'un
 * dossier média R2 :
 *   - par défaut (trajet) : `{ emprunt: [{ id, name }], rendu: [{ id, name }] }` ;
 *   - `flat=true` (incident, mission) : `{ photos: [{ id, name, mimeType }] }`.
 * `id` est la clé R2, à passer à `/api/media/file?key=`.
 *
 * Autorisation : qui lit le trajet / l'incident / le compte rendu voit ses fichiers.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessFolder } from '@/lib/media/access';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { parseMediaFolderRef } from '@/lib/media/refs';
import { listMediaFiles } from '@/lib/media/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');
        if (!folderId || !parseMediaFolderRef(folderId)) {
            return NextResponse.json({ error: 'Paramètre folderId invalide' }, { status: 400 });
        }

        if (!(await canAccessFolder(session, folderId))) {
            return forbiddenResponse();
        }

        const files = await listMediaFiles(folderId);

        if (searchParams.get('flat') === 'true') {
            const photos = files
                .filter((f) => f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf')
                .map(({ id, name, mimeType }) => ({ id, name, mimeType }));
            return NextResponse.json({ photos });
        }

        const images = files.filter((f) => f.mimeType.startsWith('image/'));
        return NextResponse.json({
            emprunt: images.filter((f) => f.stage === 'emprunt').map(({ id, name }) => ({ id, name })),
            rendu: images.filter((f) => f.stage === 'rendu').map(({ id, name }) => ({ id, name })),
        });
    } catch (error: unknown) {
        console.error('[GET /api/media/photos]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors de la récupération des photos' }, { status: 500 });
    }
}
