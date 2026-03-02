import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { google } from 'googleapis';
import { Readable } from 'stream';

const SHARED_FOLDER_ID = '1OqPb5TLpNhIYRxzwWiOcpQkFWLGs8m3X';

export async function POST(request: Request) {
    try {
        const session = await auth();
        // Check if user is authenticated and has an access token
        if (!session?.user || !session.accessToken) {
            return NextResponse.json(
                { error: 'Non authentifié ou permission Drive manquante. Veuillez vous reconnecter.' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        const vehicleName = formData.get('vehicleName') as string;
        const dateStr = formData.get('date') as string;
        const stage = formData.get('stage') as string; // 'emprunt' or 'rendu'
        let existingFolderId = formData.get('existingFolderId') as string | null;

        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ success: true, folderId: existingFolderId });
        }

        if (!vehicleName || !dateStr || !stage) {
            return NextResponse.json({ error: 'Données manquantes (vehicleName, date, stage)' }, { status: 400 });
        }

        // Initialize Google Drive API client with user's access token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: session.accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // 1. Get or Create Parent Folder: "[Véhicule]-[Date]"
        let parentFolderId = existingFolderId;

        if (!parentFolderId || parentFolderId === 'null') {
            const folderName = `${vehicleName}-${dateStr}`;

            // Try to find if it already exists just in case
            const searchRes = await drive.files.list({
                q: `name='${folderName}' and '${SHARED_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id)',
                spaces: 'drive',
            });

            if (searchRes.data.files && searchRes.data.files.length > 0) {
                parentFolderId = searchRes.data.files[0].id!;
            } else {
                // Create it
                const folderMetadata = {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [SHARED_FOLDER_ID],
                };
                const folderRes = await drive.files.create({
                    requestBody: folderMetadata,
                    fields: 'id',
                });
                parentFolderId = folderRes.data.id!;
            }
        }

        // 2. Create the Stage Subfolder: "emprunt" or "rendu"
        const subfolderMetadata = {
            name: stage,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };
        const subfolderRes = await drive.files.create({
            requestBody: subfolderMetadata,
            fields: 'id',
        });
        const subfolderId = subfolderRes.data.id!;

        // 3. Upload all files into the Stage Subfolder
        const uploadPromises = files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const stream = new Readable();
            stream.push(buffer);
            stream.push(null);

            const fileMetadata = {
                name: file.name,
                parents: [subfolderId],
            };
            const media = {
                mimeType: file.type,
                body: stream,
            };

            return drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id, webViewLink',
            });
        });

        await Promise.all(uploadPromises);

        return NextResponse.json({ success: true, folderId: parentFolderId });

    } catch (error: any) {
        console.error('Google Drive Upload Error:', error?.response?.data || error.message);

        // Handle token expiration or scope errors specifically
        if (error?.response?.status === 401 || error?.response?.status === 403) {
            return NextResponse.json(
                { error: 'Permissions Google Drive invalides ou expirées. Veuillez vous déconnecter puis vous reconnecter.' },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: 'Erreur lors de la création du dossier ou de l\'envoi des photos.' },
            { status: 500 }
        );
    }
}
