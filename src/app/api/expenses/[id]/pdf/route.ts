import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

async function processImageForPdf(input: string | null | undefined, maxWidth = 400, maxHeight = 200): Promise<string | null> {
    if (!input || typeof input !== 'string') return null;
    try {
        let buffer: Buffer | null = null;
        if (input.startsWith('data:')) {
            const parts = input.split(',');
            if (parts.length > 1) {
                buffer = Buffer.from(parts[1], 'base64');
            }
        } else if (input.startsWith('http://') || input.startsWith('https://')) {
            const res = await fetch(input);
            if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
            }
        }

        if (!buffer) return null;

        const pngBuffer = await sharp(buffer)
            .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toBuffer();

        return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch (err) {
        console.error('Failed to process image for PDF:', err);
        return null;
    }
}

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

    const processedStamp = await processImageForPdf(row.ulStampImage as string, 400, 200);

    let processedUserSig = (row.userSignature as string) || null;
    if (processedUserSig) {
        try {
            const parsed = JSON.parse(processedUserSig);
            if (parsed.image) {
                const cleanImg = await processImageForPdf(parsed.image, 300, 100);
                if (cleanImg) {
                    parsed.image = cleanImg;
                    processedUserSig = JSON.stringify(parsed);
                }
            }
        } catch {
            // keep original
        }
    }

    let processedValSig = (row.validatorSignature as string) || null;
    if (processedValSig) {
        try {
            const parsed = JSON.parse(processedValSig);
            if (parsed.image) {
                const cleanImg = await processImageForPdf(parsed.image, 300, 100);
                if (cleanImg) {
                    parsed.image = cleanImg;
                    processedValSig = JSON.stringify(parsed);
                }
            }
        } catch {
            // keep original
        }
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
        ulStampImage: processedStamp,
        userFunction: (row.userFunction as string) || null,
        userSignature: processedUserSig,
        validatorName: (row.validatorName as string) || null,
        validatedAt: (row.validatedAt as string) || null,
        validatorSignature: processedValSig,
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
