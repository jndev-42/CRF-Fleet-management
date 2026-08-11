import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { canAccessDriveFolder } from '@/lib/driveAuth';
import { getErrorMessage } from '@/lib/utils/error';
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

        if (folderId.startsWith('mock-')) {
            const flat = searchParams.get('flat') === 'true';
            if (flat) {
                return NextResponse.json({
                    photos: [
                        { id: 'mock-photo-1', name: 'justificatif_1.jpg', mimeType: 'image/jpeg' },
                        { id: 'mock-photo-2', name: 'justificatif_2.pdf', mimeType: 'application/pdf' }
                    ]
                });
            }
            return NextResponse.json({
                emprunt: [{ id: 'mock-photo-1', name: 'photo_emprunt.jpg', mimeType: 'image/jpeg' }],
                rendu: [{ id: 'mock-photo-2', name: 'photo_rendu.jpg', mimeType: 'image/jpeg' }]
            });
        }

        if (!(await canAccessDriveFolder(session, folderId))) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const drive = getDriveClient();

        // Flat mode: list images and PDFs directly in the folder (no subfolders), used for expense receipts and mission photos
        const flat = searchParams.get('flat') === 'true';
        if (flat) {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType = 'application/pdf') and trashed=false`,
                fields: 'files(id, name, mimeType)',
            });
            const photos = (res.data.files ?? [])
                .filter((f): f is { id: string; name: string; mimeType?: string } =>
                    typeof f.id === 'string' && typeof f.name === 'string'
                )
                .map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
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
        console.error('Google Drive Photos Fetch Error:', getErrorMessage(error));

        return NextResponse.json({ error: 'Erreur lors de la récupération des photos' }, { status: 500 });
    }
}
