import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';



async function generateExpensePdf(reportId: string): Promise<Buffer> {
    const result = await db.execute({
        sql: `
            SELECT er.*, u.name as userName, u.email as userEmail,
                   val.name as validatorName, ul.name as ulName, ul.stampImage as ulStampImage
            FROM "ExpenseReport" er
            JOIN "User" u ON u.id = er.userId
            LEFT JOIN "User" val ON val.id = er.validatedBy
            LEFT JOIN "UniteLocale" ul ON ul.id = er.ulId
            WHERE er.id = ?
        `,
        args: [reportId],
    });

    if (result.rows.length === 0) {
        throw new Error('Note de frais non trouvée');
    }

    const row = result.rows[0];

    let parsedItems = [];
    try {
        parsedItems = JSON.parse(row.items as string);
    } catch (e) {
        console.error('Failed to parse items for PDF', e);
    }

    const report = {
        id: row.id as string,
        userName: row.userName as string,
        userEmail: row.userEmail as string,
        submittedAt: row.submittedAt as string,
        missionName: (row.missionName as string) || null,
        missionDate: (row.missionDate as string) || null,
        status: row.status as string,
        imputation: (row.imputation as string) || 'DLUS',
        customImputation: (row.customImputation as string) || null,
        requestRefund: row.requestRefund === 1,
        noReceiptDeclaration: row.noReceiptDeclaration === 1,
        total: Number(row.total),
        items: parsedItems,
        ulId: row.ulId as string,
        ulName: (row.ulName as string) || (row.ulId === 'ul-paris-18' ? 'Paris 18' : row.ulId as string),
        ulStampImage: (row.ulStampImage as string) || null,
        userFunction: (row.userFunction as string) || null,
        userSignature: (row.userSignature as string) || null,
        validatorName: (row.validatorName as string) || null,
        validatedAt: (row.validatedAt as string) || null,
        validatorSignature: (row.validatorSignature as string) || null,
    };

    let logoSrc = '';
    try {
        const logoPath = path.join(process.cwd(), 'public', 'logo_crf_text.png');
        if (fs.existsSync(logoPath)) {
            const logoPng = await sharp(logoPath)
                .resize(480, 130, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
                .png()
                .toBuffer();
            logoSrc = `data:image/png;base64,${logoPng.toString('base64')}`;
        }
    } catch (err) {
        console.error('Failed to process logo image for PDF:', err);
    }

    const element = createElement(ExpensePdfDocument, {
        report,
        logoSrc,
    }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;

    const buffer = await renderToBuffer(element);
    return Buffer.from(buffer);
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        const ownershipRes = await db.execute({
            sql: `SELECT userId, status FROM "ExpenseReport" WHERE id = ?`,
            args: [id],
        });
        const ownershipRow = ownershipRes.rows[0];
        if (!ownershipRow) {
            return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
        }

        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isTresorier = roles.includes('TRESORIER');
        const isOwner = ownershipRow.userId === session.user.id;
        if (!isManager && !isOwner && !(isTresorier && ownershipRow.status === 'en_attente_paiement')) {
            return forbiddenResponse();
        }

        const buffer = await generateExpensePdf(id);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="note-de-frais-${id}.pdf"`,
                'Content-Length': String(buffer.length),
            },
        });
    } catch (error) {
        console.error('[GET /api/expenses/[id]/pdf]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la génération du PDF.' }, { status: 500 });
    }
}
