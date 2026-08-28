// @vitest-environment node
/**
 * Verrouille la correspondance entre la MISE EN PAGE RENDUE et les constantes de
 * `signature-layout.ts`.
 *
 * ⚠️ POURQUOI CE TEST EXISTE. Les rectangles des widgets sont des constantes,
 * mesurées une fois sur le rendu. Rien n'empêche une retouche de mise en page de
 * déplacer les zones sans que personne ne s'en aperçoive : le PDF resterait
 * valide, les signatures aussi, et le tracé se retrouverait simplement à côté de
 * sa case — figé par DocMDP, donc incorrigible. Ce test rend cette dérive
 * bruyante. En cas d'échec, rejouer :
 *
 *   npx tsx scripts/measure-signature-rects.ts
 *
 * et reporter les nouvelles valeurs.
 */

import { describe, it, expect } from 'vitest';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';
import { filledRect } from '@/lib/pdf/content-stream';
import { countPages } from '@/lib/pdf/verify';
import {
    SIGNATURE_WIDGET_RECTS, MEASURE_ZONE_COLORS, MAX_ITEMS_SINGLE_PAGE,
} from '@/lib/expenses/signature-layout';

async function render(itemCount: number, measureZones = true): Promise<Buffer> {
    const items = Array.from({ length: itemCount }, (_, i) => ({ label: `Frais ${i + 1}`, amount: 10 }));
    const report = {
        id: 'geo', userName: 'Jean Dupont', userEmail: 'jean@dev.local',
        submittedAt: '2026-08-28T09:00:00.000Z', missionName: 'Maraude Paris 18',
        missionDate: '2026-08-20', status: 'soumis', imputation: 'DLUS',
        customImputation: null, requestRefund: true, noReceiptDeclaration: false,
        total: itemCount * 10, items, ulId: 'ul-paris-18', ulName: 'Paris 18',
        ulStampImage: null, userFunction: 'Bénévole local',
        validatorName: null, validatedAt: null,
    };
    const el = createElement(ExpensePdfDocument, {
        report, logoSrc: '', forSealing: true, measureZones,
    }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
    return Buffer.from(await renderToBuffer(el));
}

/** Tolérance en points : le rendu est déterministe, on n'absorbe que l'arrondi. */
const TOL = 0.6;

function attendRect(mesure: number[] | null, attendu: readonly number[]): void {
    expect(mesure).not.toBeNull();
    for (let i = 0; i < 4; i++) {
        expect(Math.abs(mesure![i] - attendu[i]), `composante ${i} : ${mesure} ≠ ${attendu}`)
            .toBeLessThanOrEqual(TOL);
    }
}

describe('géométrie des zones de signature', () => {
    it('place les zones là où SIGNATURE_WIDGET_RECTS les annonce', async () => {
        const pdf = await render(3);
        attendRect(filledRect(pdf, MEASURE_ZONE_COLORS.demandeur), SIGNATURE_WIDGET_RECTS.demandeur);
        attendRect(filledRect(pdf, MEASURE_ZONE_COLORS.valideur), SIGNATURE_WIDGET_RECTS.valideur);
    }, 30_000);

    // L'espaceur `flexGrow` doit absorber toute la hauteur variable : sans lui,
    // une note courte ferait remonter le bloc signature.
    it('garde les zones INVARIANTES de 1 poste au maximum admis', async () => {
        for (const n of [1, MAX_ITEMS_SINGLE_PAGE]) {
            const pdf = await render(n);
            attendRect(filledRect(pdf, MEASURE_ZONE_COLORS.demandeur), SIGNATURE_WIDGET_RECTS.demandeur);
            attendRect(filledRect(pdf, MEASURE_ZONE_COLORS.valideur), SIGNATURE_WIDGET_RECTS.valideur);
        }
    }, 60_000);

    // Le pied de page est rendu même sans logo — `loadLogo()` peut ne rien
    // fournir — précisément pour que sa hauteur ne change pas la mise en page.
    it('ne bouge pas selon la présence du logo', async () => {
        const items = [{ label: 'Frais 1', amount: 10 }];
        const base = {
            id: 'geo', userName: 'Jean Dupont', userEmail: 'jean@dev.local',
            submittedAt: '2026-08-28T09:00:00.000Z', missionName: 'M', missionDate: '2026-08-20',
            status: 'soumis', imputation: 'DLUS', customImputation: null, requestRefund: true,
            noReceiptDeclaration: false, total: 10, items, ulId: 'ul-paris-18', ulName: 'Paris 18',
            ulStampImage: null, userFunction: 'Bénévole local', validatorName: null, validatedAt: null,
        };
        // 1×1 PNG transparent : un logo présent, sans dépendre d'un fichier.
        const logo = 'data:image/png;base64,' +
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const rects: (number[] | null)[] = [];
        for (const logoSrc of ['', logo]) {
            const el = createElement(ExpensePdfDocument, {
                report: base, logoSrc, forSealing: true, measureZones: true,
            }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
            rects.push(filledRect(Buffer.from(await renderToBuffer(el)), MEASURE_ZONE_COLORS.demandeur));
        }
        expect(rects[0]).toEqual(rects[1]);
    }, 40_000);

    // MAX_ITEMS_SINGLE_PAGE est DÉRIVÉ, pas supposé : toute retouche de mise en
    // page qui change le nombre de postes tenant sur une page casse ce test et
    // livre la nouvelle valeur.
    it('DÉRIVE le seuil de pagination au lieu de le supposer', async () => {
        expect(countPages(await render(MAX_ITEMS_SINGLE_PAGE, false))).toBe(1);
        expect(countPages(await render(MAX_ITEMS_SINGLE_PAGE + 1, false))).toBe(2);
    }, 40_000);
});
