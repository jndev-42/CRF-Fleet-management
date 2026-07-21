import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';
import path from 'path';
import sharp from 'sharp';

async function generateExpensePdf(reportId: string): Promise<Buffer> {
    const result = await db.execute({
        sql: `
            SELECT er.*, u.name as userName, u.email as userEmail,
                   val.name as validatorName, ul.name as ulName
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
        status: row.status as string,
        imputation: (row.imputation as string) || 'DLUS',
        customImputation: (row.customImputation as string) || null,
        requestRefund: row.requestRefund === 1,
        noReceiptDeclaration: row.noReceiptDeclaration === 1,
        total: Number(row.total),
        items: parsedItems,
        ulId: row.ulId as string,
        ulName: (row.ulName as string) || (row.ulId === 'ul-paris-18' ? 'Paris 18' : row.ulId as string),
        userFunction: (row.userFunction as string) || null,
        userSignature: (row.userSignature as string) || null,
        validatorName: (row.validatorName as string) || null,
        validatedAt: (row.validatedAt as string) || null,
        validatorSignature: (row.validatorSignature as string) || null,
    };

    let logoSrc = '';
    try {
        const logoPng = await sharp(path.join(process.cwd(), 'public', 'crf-logo.svg'))
            .resize(96, 96)
            .png()
            .toBuffer();
        logoSrc = `data:image/png;base64,${logoPng.toString('base64')}`;
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
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
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
