/**
 * Génération du PDF de note de frais.
 *
 * Extrait de `src/app/api/expenses/[id]/pdf/route.ts` : la route, le POST, le
 * PATCH et le script de backfill en ont tous besoin. Aucun changement fonctionnel
 * par rapport à la version d'origine, hormis le drapeau `forSealing`.
 */

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { db } from '@/lib/db';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';

export class ExpenseNotFoundError extends Error {}

export interface GenerateOptions {
    /**
     * Rendu destiné au scellement : les zones d'image de signature restent vides,
     * le visuel étant fourni par les widgets PDF. Voir `ExpensePdfDocument`.
     */
    forSealing?: boolean;
}

/** Logo CRF encodé en data URI, mis en cache pour la durée du lambda. */
let cachedLogo: string | null = null;

async function loadLogo(): Promise<string> {
    if (cachedLogo !== null) return cachedLogo;
    try {
        const logoPath = path.join(process.cwd(), 'public', 'logo_crf_text.png');
        if (fs.existsSync(logoPath)) {
            const png = await sharp(logoPath)
                .resize(480, 130, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
                .png()
                .toBuffer();
            cachedLogo = `data:image/png;base64,${png.toString('base64')}`;
            return cachedLogo;
        }
    } catch (err) {
        console.error('[expenses/pdf] Traitement du logo impossible :', err);
    }
    cachedLogo = '';
    return cachedLogo;
}

/**
 * Assemble et rend le PDF d'une note de frais.
 *
 * @throws {ExpenseNotFoundError} si la note n'existe pas.
 */
export async function generateExpensePdf(
    reportId: string,
    options: GenerateOptions = {}
): Promise<Buffer> {
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
        throw new ExpenseNotFoundError('Note de frais non trouvée');
    }

    const row = result.rows[0];

    let parsedItems: { label: string; amount: number }[] = [];
    try {
        parsedItems = JSON.parse(row.items as string);
    } catch (e) {
        console.error('[expenses/pdf] items illisibles', e);
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
        ulName: (row.ulName as string) || (row.ulId === 'ul-paris-18' ? 'Paris 18' : (row.ulId as string)),
        ulStampImage: (row.ulStampImage as string) || null,
        userFunction: (row.userFunction as string) || null,
        userSignature: (row.userSignature as string) || null,
        validatorName: (row.validatorName as string) || null,
        validatedAt: (row.validatedAt as string) || null,
        validatorSignature: (row.validatorSignature as string) || null,
    };

    const element = createElement(ExpensePdfDocument, {
        report,
        logoSrc: await loadLogo(),
        forSealing: options.forSealing ?? false,
    }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;

    return Buffer.from(await renderToBuffer(element));
}

/** Nombre de postes de dépense d'une note — garde-fou D6 avant scellement. */
export function countItems(itemsJson: string): number {
    try {
        const parsed = JSON.parse(itemsJson);
        return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
        return 0;
    }
}
