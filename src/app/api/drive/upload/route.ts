import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { Readable } from 'stream';

const SHARED_FOLDER_ID = '11UwzHHOzNhn--f16eMaoWk9NgvOwOt2G';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;
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
        if (files.length > MAX_FILES) {
            return NextResponse.json(
                { error: `Trop de fichiers. Maximum ${MAX_FILES} fichiers autorisés.` },
                { status: 400 }
            );
        }
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" dépasse la taille maximale de 10 Mo.` },
                    { status: 400 }
                );
            }
            if (!file.type.startsWith(ALLOWED_MIME_PREFIX) && !(allowPdf && file.type === 'application/pdf')) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" n'est pas une image valide.` },
                    { status: 400 }
                );
            }
        }

        // Initialize Google Drive API client using Service Account
        const drive = getDriveClient();

        // 1. Get or Create Parent Folder
        let parentFolderId = existingFolderId;

        if (!parentFolderId || parentFolderId === 'null') {
            const folderName = stage
                ? `${vehicleName}-${dateStr}`
                : `${missionName}-${dateStr}`;

            const effectiveRootFolder = stage ? SHARED_FOLDER_ID : rootFolderId;

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

        return NextResponse.json({ success: true, folderId: parentFolderId, fileIds });

    } catch (error: unknown) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('Google Drive Upload Error:', err?.response?.data ?? err?.message);

        return NextResponse.json(
            { error: 'Erreur lors de la création du dossier ou de l\'envoi des photos.' },
            { status: 500 }
        );
    }
}
