import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { Readable } from 'stream';

const SHARED_FOLDER_ID = '11UwzHHOzNhn--f16eMaoWk9NgvOwOt2G';
const PREVIEW_FOLDER_NAME = 'PREVIEW';

const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';

/**
 * En mode preview, tous les uploads se font sous un dossier PREVIEW/
 * à la racine de SHARED_FOLDER_ID.
 * Ce dossier est créé automatiquement s'il n'existe pas.
 */
async function getPreviewRootFolderId(): Promise<string> {
    const drive = getDriveClient();
    const searchRes = await drive.files.list({
        q: `name='${PREVIEW_FOLDER_NAME}' and '${SHARED_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
    }

    // Créer le dossier PREVIEW
    const created = await drive.files.create({
        requestBody: {
            name: PREVIEW_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [SHARED_FOLDER_ID],
        },
        fields: 'id',
    });
    return created.data.id!;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB per file
const MAX_TOTAL_SIZE = 150 * 1024 * 1024; // 150 MB total max per request
const ALLOWED_MIME_PREFIX = 'image/';

export async function POST(request: Request) {
    try {
        const session = await auth();
        // Just verify they are logged in. We don't need their tokens anymore.
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Non authentifié.' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        const vehicleName = formData.get('vehicleName') as string | null;
        const dateStr = formData.get('date') as string;
        const stage = formData.get('stage') as string | null; // 'emprunt' or 'rendu' — optional for mission flow
        const existingFolderId = formData.get('existingFolderId') as string | null;
        const missionName = formData.get('missionName') as string | null; // used when stage is absent
        const rootFolderId = (formData.get('rootFolderId') as string | null) ?? SHARED_FOLDER_ID;
        const allowPdf = formData.get('allowPdf') === 'true';

        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ success: true, folderId: existingFolderId });
        }

        // Validation: vehicle flow requires vehicleName + stage; mission flow requires missionName
        if (stage) {
            if (!vehicleName || !dateStr) {
                return NextResponse.json({ error: 'Données manquantes (vehicleName, date, stage)' }, { status: 400 });
            }
        } else {
            if (!missionName || !dateStr) {
                return NextResponse.json({ error: 'Données manquantes (missionName, date)' }, { status: 400 });
            }
        }

        // Server-side file validation
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
            return NextResponse.json(
                { error: `La taille totale des fichiers (${(totalSize / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite maximale de 150 Mo par envoi.` },
                { status: 400 }
            );
        }

        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la taille maximale autorisée de 15 Mo par fichier.` },
                    { status: 400 }
                );
            }
            if (!file.type.startsWith(ALLOWED_MIME_PREFIX) && !(allowPdf && file.type === 'application/pdf')) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" n'est pas une image ou un fichier PDF valide.` },
                    { status: 400 }
                );
            }
        }

        if (isPreview) {
            const uploadTargetId = `mock-folder-drive-${Date.now()}`;
            const fileIds = files.map((_, i) => `mock-file-${i}-${Date.now()}`);
            return NextResponse.json({ success: true, folderId: uploadTargetId, subfolderId: uploadTargetId, fileIds });
        }

        // Initialize Google Drive API client using Service Account
        const drive = getDriveClient();

        // En mode preview : utiliser le dossier PREVIEW/ comme racine pour TOUS les uploads.
        // Cela remplace aussi le rootFolderId passé par le client (ex: MissionWizard),
        // afin que les rapports signés et photos de mission soient également sous PREVIEW/.
        const effectiveSharedFolderId = isPreview
            ? await getPreviewRootFolderId()
            : SHARED_FOLDER_ID;
        const effectiveRootFolderId = isPreview ? effectiveSharedFolderId : rootFolderId;

        // 1. Get or Create Parent Folder
        let parentFolderId = existingFolderId;

        if (!parentFolderId || parentFolderId === 'null') {
            const folderName = stage
                ? `${vehicleName}-${dateStr}`
                : `${missionName}-${dateStr}`;

            const effectiveRootFolder = stage ? effectiveSharedFolderId : effectiveRootFolderId;

            // Try to find if it already exists just in case
            const searchRes = await drive.files.list({
                q: `name='${folderName}' and '${effectiveRootFolder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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
                    parents: [effectiveRootFolder],
                };
                const folderRes = await drive.files.create({
                    requestBody: folderMetadata,
                    fields: 'id',
                });
                parentFolderId = folderRes.data.id!;
            }
        }

        // 2. For vehicle flow: create stage subfolder and upload into it.
        //    For mission flow: upload directly into the parent folder.
        let uploadTargetId: string;

        if (stage) {
            // Try to find if the subfolder already exists
            const subSearchRes = await drive.files.list({
                q: `name='${stage}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id)',
                spaces: 'drive',
            });

            if (subSearchRes.data.files && subSearchRes.data.files.length > 0) {
                uploadTargetId = subSearchRes.data.files[0].id!;
            } else {
                const subfolderMetadata = {
                    name: stage,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentFolderId],
                };
                const subfolderRes = await drive.files.create({
                    requestBody: subfolderMetadata,
                    fields: 'id',
                });
                uploadTargetId = subfolderRes.data.id!;
            }
        } else {
            uploadTargetId = parentFolderId;
        }

        // 3. Upload all files into the target folder
        const uploadPromises = files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const stream = new Readable();
            stream.push(buffer);
            stream.push(null);

            const fileMetadata = {
                name: file.name,
                parents: [uploadTargetId],
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

        const uploadResults = await Promise.all(uploadPromises);
        const fileIds = uploadResults.map(r => r.data.id as string);

        return NextResponse.json({ success: true, folderId: parentFolderId, subfolderId: uploadTargetId, fileIds });

    } catch (error: unknown) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('Google Drive Upload Error:', err?.response?.data ?? err?.message);

        return NextResponse.json(
            { error: 'Erreur lors de la création du dossier ou de l\'envoi des photos.' },
            { status: 500 }
        );
    }
}
