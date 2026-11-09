/**
 * Dépôt transitoire des justificatifs d'une note de frais.
 *
 * Remplace le stockage sur Google Drive : les fichiers sont compressés puis
 * déposés sous `expenses-staging/{UL}/{stagingId}/…`, en attendant que la note
 * soit soumise. UL : celle de la note (`reportId`, brouillon de l'utilisateur),
 * sinon l'UL active de la session (nouvelle note, même repli que `POST /api/expenses`).
 * `stagingId` émis et signé par le serveur pour le déposant (`issueStagingId`) : un
 * identifiant client non signé pour lui est ignoré. Au premier scellement, `sealStep1` les intègre comme
 * pages du PDF puis les supprime — jamais référencés depuis une note soumise.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';

// Compression (sharp) + upload R2 : le runtime Edge ne convient pas.
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo par fichier
const MAX_TOTAL_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo au total par envoi — sous la limite de corps Vercel (4.5 Mo)

async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }
        const userId = session.user.id;

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];
        const { isStagingIdSignedFor, issueStagingId } = await import('@/lib/expenses/receipt-keys');
        const clientStagingId = formData.get('stagingId');
        // Un identifiant client n'est repris que s'il a été signé pour ce déposant.
        const existingStagingId = isStagingIdSignedFor(clientStagingId, userId) ? clientStagingId as string : null;
        const reportId = formData.get('reportId');

        // UL de rangement : celle de la note éditée (brouillon de l'utilisateur), sinon
        // l'UL active — celle sous laquelle `POST /api/expenses` créera la note.
        let ulId = session.user.ulId || 'ul-paris-18';
        if (typeof reportId === 'string' && reportId) {
            const res = await db.execute({
                sql: `SELECT userId, status, ulId FROM "ExpenseReport" WHERE id = ?`,
                args: [reportId],
            });
            const report = res.rows[0];
            if (!report) {
                return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
            }
            if (report.userId !== userId || report.status !== 'brouillon') {
                return forbiddenResponse('Seul le demandeur peut ajouter des justificatifs à son brouillon.');
            }
            ulId = (report.ulId as string) || 'ul-paris-18';
        }

        if (!files || files.length === 0) {
            return NextResponse.json({ success: true, stagingId: existingStagingId, keys: [] });
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
        const { ulSegmentOf } = await import('@/lib/media/server');

        const stagingId = existingStagingId ?? issueStagingId(userId);
        const ulSegment = await ulSegmentOf(ulId);

        const keys = await Promise.all(files.map(async (file) => {
            const raw = Buffer.from(await file.arrayBuffer());
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            // Compressée dès le dépôt : le stockage transitoire porte déjà le poids
            // final, pas de recompression à refaire à l'intégration dans le PDF.
            const body = isPdf ? raw : await compressJustificatifImage(raw);
            const key = buildExpenseStagingKey(ulSegment, stagingId, isPdf ? file.name : file.name.replace(/\.\w+$/, '.jpg'));
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

export const POST = withAudit(postHandler, { action: "Envoi d'un justificatif de frais", entityType: 'expenseReceipt' });
