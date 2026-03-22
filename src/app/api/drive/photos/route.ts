import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import type { drive_v3 } from 'googleapis';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');

        if (!folderId) {
            return NextResponse.json({ error: 'Paramètre folderId manquant' }, { status: 400 });
        }

        const drive = getDriveClient();

        // Flat mode: list images directly in the folder (no subfolders), used for mission photos
        const flat = searchParams.get('flat') === 'true';
        if (flat) {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id, name)',
            });
            const photos = (res.data.files ?? [])
                .filter((f): f is { id: string; name: string } =>
                    typeof f.id === 'string' && typeof f.name === 'string'
                )
                .map(f => ({ id: f.id, name: f.name }));
            return NextResponse.json({ photos });
        }

        // 1. Fetch subfolders inside parent `[Vehicule]-[Date]` folder (e.g. "emprunt", "rendu")
        const subfoldersRes = await drive.files.list({
            q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        const folders = subfoldersRes.data.files || [];

        if (folders.length === 0) {
            return NextResponse.json({ emprunt: [], rendu: [] });
        }

        // 2. Map folders to fetch their standard image files
        const photoData: { emprunt: Array<{ id: string, name: string }>, rendu: Array<{ id: string, name: string }> } = { emprunt: [], rendu: [] };

        await Promise.all(folders.map(async (folder) => {
            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id, name)',
            });

            const fileList = (filesRes.data.files || []) as drive_v3.Schema$File[];
            const mapped = fileList
                .filter((f): f is drive_v3.Schema$File & { id: string; name: string } =>
                    typeof f.id === 'string' && typeof f.name === 'string'
                )
                .map(f => ({ id: f.id, name: f.name }));

            if (folder.name?.toLowerCase() === 'emprunt') {
                photoData.emprunt = mapped;
            } else if (folder.name?.toLowerCase() === 'rendu') {
                photoData.rendu = mapped;
            }
        }));

        return NextResponse.json(photoData);

    } catch (error: unknown) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('Google Drive Photos Fetch Error:', err?.response?.data ?? err?.message);

        return NextResponse.json({ error: 'Erreur lors de la récupération des photos' }, { status: 500 });
    }
}
