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

    for (const legacyLayout of [false, true]) {
        const el = createElement(ExpensePdfDocument, {
            report, logoSrc: '', forSealing: true, measureZones: true, legacyLayout,
        }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
        const pdf = Buffer.from(await renderToBuffer(el));

        console.log(legacyLayout
            ? '\nDisposition v1 (scellement rétroactif) → LEGACY_SIGNATURE_WIDGET_RECTS :\n'
            : 'Disposition v2 (circuit RESPO puis président) → SIGNATURE_WIDGET_RECTS :\n');
        for (const [nom, couleur] of Object.entries(MEASURE_ZONE_COLORS)) {
            const rect = filledRect(pdf, couleur);
            if (legacyLayout && nom === 'president') continue; // pas de widget président en v1
            console.log(`  ${nom.padEnd(10)} ${rect ? `[${rect.join(', ')}]` : 'INTROUVABLE'}`);
        }
    }
    console.log('\nÀ reporter dans src/lib/expenses/signature-layout.ts (points PDF, origine en bas à gauche).');
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
