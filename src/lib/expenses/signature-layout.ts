/**
 * Géométrie des signatures visuelles sur le PDF de note de frais.
 *
 * SOURCE UNIQUE DE VÉRITÉ, importée des DEUX côtés :
 *   - `ExpensePdfDocument.tsx` — pour réserver les zones dans la mise en page
 *   - `sealing.ts`             — pour le `widgetRect` passé à `plainAddPlaceholder`
 *
 * Sans ce partage, la position du widget et celle de la colonne dériveraient
 * indépendamment, et le décalage ne serait visible qu'après scellement — donc
 * définitivement figé par DocMDP.
 *
 * ⚠️ UNITÉS. `widgetRect` attend des POINTS PDF, origine en BAS À GAUCHE.
 * `@react-pdf/renderer` positionne en pourcentages/points avec origine en HAUT
 * À GAUCHE. La conversion est `pdfY = PAGE_HEIGHT - yDepuisLeHaut - hauteur`.
 * Ne JAMAIS rétro-analyser le flux de contenu du PDF pour retrouver ces valeurs :
 * c'est fragile et cassé au premier changement de libellé ou de police.
 */

/**
 * MediaBox réellement émis par `@react-pdf/renderer@4.3.2` pour `<Page size="A4">`.
 *
 * Mesuré, pas supposé : la valeur nominale A4 est 595.28 × 841.89, l'émission
 * réelle est 595.280029 × 841.890015. `assertPageGeometry` vérifie au scellement
 * que le document traité correspond bien — une conversion juste sur une mauvaise
 * hauteur de page produit un widget mal placé.
 */
export const PAGE_WIDTH = 595.280029;
export const PAGE_HEIGHT = 841.890015;

/**
 * Rectangles des widgets de signature, en points PDF `[x1, y1, x2, y2]`.
 *
 * MESURÉS, pas devinés : `ExpensePdfDocument` est rendu avec un aplat de couleur
 * dans chaque zone de signature, puis les rectangles colorés sont localisés au
 * pixel près et convertis en points PDF. Ne jamais les recalculer à la main.
 *
 * ⚠️ CES VALEURS NE SONT CONSTANTES QUE PARCE QUE LA MISE EN PAGE EST INVARIANTE.
 * Deux dispositifs le garantissent en mode `forSealing`, tous deux indispensables :
 *   1. un espaceur `flexGrow: 1` épingle le bloc signature au bas de page, sinon
 *      il remonte quand la note compte peu de postes ;
 *   2. le bloc de métadonnées a une hauteur FIXE (`sigMetaFixed`), sinon la zone
 *      image se déplace selon la présence du hash de signature ou de la date de
 *      validation — `sigCol` utilisant `justifyContent: 'space-between'`.
 *
 * Vérifié identique pour 1 et 14 postes, avec et sans hash, note validée ou non.
 * Un widget mal placé est FIGÉ PAR DocMDP : il n'est plus corrigeable après coup.
 */
export const SIGNATURE_WIDGET_RECTS = {
    /** Colonne « Le demandeur : » — signature #1 (D10 : widget, pas contenu). */
    demandeur: [34.3, 169, 199.8, 204.4] as const,
    /** Colonne « Le responsable : » — signature #2. */
    valideur: [213.6, 169, 379.2, 204.4] as const,
    /**
     * Signature #3 (payeur) : AUCUN widget.
     * `widgetRect` omis à l'appel ⇒ `plainAddPlaceholder` produit `/Rect [0 0 0 0]`.
     * L'invisibilité est native, il n'y a rien à coder.
     */
    payeur: null,
} as const;

/** Convertit une ordonnée « depuis le haut de page » en ordonnée PDF. */
export function toPdfY(yFromTop: number, height: number): number {
    return PAGE_HEIGHT - yFromTop - height;
}

/**
 * Nombre maximal de postes de dépense tenant sur une seule page.
 *
 * Décision D6 : au-delà, le scellement est REFUSÉ (400) plutôt que de produire un
 * document cassé — le bloc signature partirait en page 2 alors que le widget est
 * toujours estampillé sur la page 1 (`getPageRef` de `@signpdf/placeholder-plain`
 * retourne systématiquement la première référence de `/Kids`).
 *
 * ⚠️ Valeur DÉRIVÉE, pas devinée : `signature-layout.test.ts` rend le composant à
 * MAX_ITEMS_SINGLE_PAGE puis à MAX_ITEMS_SINGLE_PAGE + 1 et vérifie le basculement
 * à 2 pages. Toute modification de la mise en page du PDF casse ce test et donne
 * la nouvelle valeur, au lieu de laisser passer un document invalide.
 */
export const MAX_ITEMS_SINGLE_PAGE = 14;

/** Erreur levée quand la géométrie du document ne correspond pas aux constantes. */
export class PageGeometryError extends Error {}

/**
 * Vérifie qu'un PDF a bien la géométrie attendue avant scellement.
 * Lève plutôt que d'avertir : un widget mal placé est irrattrapable une fois scellé.
 */
export function assertPageGeometry(pdf: Buffer): void {
    const head = pdf.subarray(0, 4096).toString('latin1');
    const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(head);
    if (!m) throw new PageGeometryError('MediaBox introuvable — impossible de valider la géométrie');

    const width = Number(m[3]) - Number(m[1]);
    const height = Number(m[4]) - Number(m[2]);
    const tol = 0.5;
    if (Math.abs(width - PAGE_WIDTH) > tol || Math.abs(height - PAGE_HEIGHT) > tol) {
        throw new PageGeometryError(
            `Géométrie inattendue : MediaBox ${width}×${height}, attendu ${PAGE_WIDTH}×${PAGE_HEIGHT}. ` +
            `Les rectangles de signature seraient mal placés.`
        );
    }

    for (const [name, rect] of Object.entries(SIGNATURE_WIDGET_RECTS)) {
        if (!rect) continue;
        const [x1, y1, x2, y2] = rect;
        if (x1 < 0 || y1 < 0 || x2 > PAGE_WIDTH || y2 > PAGE_HEIGHT) {
            throw new PageGeometryError(`Rectangle « ${name} » hors du MediaBox : [${rect.join(' ')}]`);
        }
    }
}
