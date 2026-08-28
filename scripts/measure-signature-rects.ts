/**
 * Relève les rectangles des widgets de signature sur le rendu réel du PDF.
 *
 * ⚠️ À REJOUER APRÈS TOUT CHANGEMENT DE MISE EN PAGE de `ExpensePdfDocument`,
 * puis reporter les valeurs dans `src/lib/expenses/signature-layout.ts`. Les
 * constantes doivent être MESURÉES, jamais recalculées à la main : un widget mal
 * placé est figé par DocMDP dès le premier scellement et n'est plus corrigeable.
 *
 * `signature-layout.test.ts` verrouille ensuite le résultat : une mise en page
 * modifiée sans nouvelle mesure fait échouer les tests au lieu de produire, en
 * silence, des notes dont la signature flotte à côté de sa case.
 *
 *   npx tsx scripts/measure-signature-rects.ts
 */

import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import ExpensePdfDocument from '../src/components/expenses/ExpensePdfDocument';
import { filledRect } from '../src/lib/pdf/content-stream';
import { MEASURE_ZONE_COLORS } from '../src/lib/expenses/signature-layout';

async function main(): Promise<void> {
    const items = Array.from({ length: 3 }, (_, i) => ({ label: `Frais ${i + 1}`, amount: 10 }));
    const report = {
        id: 'mesure', userName: 'Jean Dupont', userEmail: 'jean@dev.local',
        submittedAt: '2026-08-28T09:00:00.000Z', missionName: 'Mission', missionDate: '2026-08-20',
        status: 'soumis', imputation: 'DLUS', customImputation: null, requestRefund: true,
        noReceiptDeclaration: false, total: 30, items, ulId: 'ul-paris-18', ulName: 'Paris 18',
        ulStampImage: null, userFunction: 'Bénévole local',
        validatorName: null, validatedAt: null,
    };

    const el = createElement(ExpensePdfDocument, {
        report, logoSrc: '', forSealing: true, measureZones: true,
    }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
    const pdf = Buffer.from(await renderToBuffer(el));

    console.log('Rectangles mesurés (points PDF, origine en bas à gauche) :\n');
    for (const [nom, couleur] of Object.entries(MEASURE_ZONE_COLORS)) {
        const rect = filledRect(pdf, couleur);
        console.log(`  ${nom.padEnd(10)} ${rect ? `[${rect.join(', ')}]` : 'INTROUVABLE'}`);
    }
    console.log('\nÀ reporter dans SIGNATURE_WIDGET_RECTS (src/lib/expenses/signature-layout.ts).');
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
