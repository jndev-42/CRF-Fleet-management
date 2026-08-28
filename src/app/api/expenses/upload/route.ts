/**
 * Dépôt transitoire des justificatifs d'une note de frais.
 *
 * Remplace le stockage sur Google Drive : les fichiers sont compressés puis
 * déposés dans le préfixe R2 `expenses-staging/{stagingId}/…`, en attendant que
 * la note soit soumise. Au premier scellement, `sealStep1` les intègre comme
 * pages du PDF puis les supprime — jamais référencés depuis une note soumise.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';

// Compression (sharp) + upload R2 : le runtime Edge ne convient pas.
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo par fichier
const MAX_TOTAL_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo au total par envoi — sous la limite de corps Vercel (4.5 Mo)

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const existingStagingId = formData.get('stagingId') as string | null;

        if (!files || files.length === 0) {
            return NextResponse.json({ success: true, stagingId: existingStagingId || null, keys: [] });
        }

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

        const { compressJustificatifImage } = await import('@/lib/expenses/attachments');
        const { buildExpenseStagingKey, putObject } = await import('@/lib/r2');

        const stagingId = existingStagingId && existingStagingId !== 'null'
            ? existingStagingId
            : crypto.randomUUID();

        const keys = await Promise.all(files.map(async (file) => {
            const raw = Buffer.from(await file.arrayBuffer());
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            // Compressée dès le dépôt : le stockage transitoire porte déjà le poids
            // final, pas de recompression à refaire à l'intégration dans le PDF.
            const body = isPdf ? raw : await compressJustificatifImage(raw);
            const key = buildExpenseStagingKey(stagingId, isPdf ? file.name : file.name.replace(/\.\w+$/, '.jpg'));
            await putObject(key, body, isPdf ? 'application/pdf' : 'image/jpeg');
            return key;
        }));

        return NextResponse.json({ success: true, stagingId, keys });
    } catch (error: unknown) {
        console.error('[POST /api/expenses/upload]', getErrorMessage(error));
        return NextResponse.json(
            { error: 'Erreur lors du dépôt des justificatifs.' },
            { status: 500 }
        );
    }
}
