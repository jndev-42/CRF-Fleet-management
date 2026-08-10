import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';
import { Readable } from 'stream';

const SHARED_FOLDER_ID = '11UwzHHOzNhn--f16eMaoWk9NgvOwOt2G';
const PREVIEW_FOLDER_NAME = 'PREVIEW';
const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';

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

const MAX_FILE_SIZE = 4.2 * 1024 * 1024; // 4.2 MB per file
const MAX_TOTAL_SIZE = 4.2 * 1024 * 1024; // 4.2 MB total max per request

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
        }

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const existingFolderId = formData.get('folderId') as string | null;

        if (!files || files.length === 0) {
            return NextResponse.json({ success: true, folderId: existingFolderId || null });
        }

        // Validate size
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
            return NextResponse.json(
                { error: `La taille totale des fichiers (${(totalSize / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite Serverless de 4.2 Mo par envoi.` },
                { status: 400 }
            );
        }

        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la taille maximale autorisée de 4.2 Mo par fichier.` },
                    { status: 400 }
                );
            }
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            if (!isImage && !isPdf) {
                return NextResponse.json(
                    { error: `Le fichier "${file.name}" n'est ni une image ni un fichier PDF valide.` },
                    { status: 400 }
                );
            }
        }

        if (isPreview) {
            const uploadTargetId = existingFolderId || `mock-folder-expense-${Date.now()}`;
            const fileIds = files.map((_, i) => `mock-file-${i}-${Date.now()}`);
            return NextResponse.json({ success: true, folderId: uploadTargetId, fileIds });
        }

        const drive = getDriveClient();

        // 1. Resolve root folder
        const effectiveSharedFolderId = isPreview
            ? await getPreviewRootFolderId()
            : SHARED_FOLDER_ID;

        // 2. Resolve "Note de frais" parent folder
        let expenseReportsParentId: string;
        const parentSearch = await drive.files.list({
            q: `name='Note de frais' and '${effectiveSharedFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive',
        });

        if (parentSearch.data.files && parentSearch.data.files.length > 0) {
            expenseReportsParentId = parentSearch.data.files[0].id!;
        } else {
            const parentFolderRes = await drive.files.create({
                requestBody: {
                    name: 'Note de frais',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [effectiveSharedFolderId],
                },
                fields: 'id',
            });
            expenseReportsParentId = parentFolderRes.data.id!;
        }

        // 3. Create subfolder for this specific expense report (if it doesn't already exist)
        let uploadTargetId = existingFolderId;
        if (!uploadTargetId || uploadTargetId === 'null') {
            const userName = session.user.name || 'Utilisateur';
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
            const folderName = `Note-de-frais-${userName.replace(/\s+/g, '_')}-${dateStr}`;

            const folderRes = await drive.files.create({
                requestBody: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [expenseReportsParentId],
                },
                fields: 'id',
            });
            uploadTargetId = folderRes.data.id!;
        }

        // 4. Upload all files
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

        return NextResponse.json({ success: true, folderId: uploadTargetId, fileIds });

    } catch (error: unknown) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('Google Drive Upload Error for Expense Report:', err?.response?.data ?? err?.message);

        return NextResponse.json(
            { error: 'Erreur lors de la création du dossier ou de l\'envoi des justificatifs.' },
            { status: 500 }
        );
    }
}
