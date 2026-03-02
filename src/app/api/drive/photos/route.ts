import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { google } from 'googleapis';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user || !session.accessToken) {
            return NextResponse.json({ error: 'Non authentifié ou token manquant' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');

        if (!folderId) {
            return NextResponse.json({ error: 'Paramètre folderId manquant' }, { status: 400 });
        }

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: session.accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

            if (folder.name?.toLowerCase() === 'emprunt') {
                photoData.emprunt = (filesRes.data.files || []) as any;
            } else if (folder.name?.toLowerCase() === 'rendu') {
                photoData.rendu = (filesRes.data.files || []) as any;
            }
        }));

        return NextResponse.json(photoData);

    } catch (error: any) {
        console.error('Google Drive Photos Fetch Error:', error?.response?.data || error.message);

        if (error?.response?.status === 401 || error?.response?.status === 403) {
            return NextResponse.json(
                { error: 'Permissions expirées. Veuillez vous reconnecter.' },
                { status: 401 }
            );
        }

        return NextResponse.json({ error: 'Erreur lors de la récupération des photos' }, { status: 500 });
    }
}
