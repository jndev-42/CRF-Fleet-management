/**
 * Géométrie des signatures visuelles sur le PDF de note de frais.
 *
 * SOURCE UNIQUE DE VÉRITÉ, importée des DEUX côtés :
 *   - `ExpensePdfDocument.tsx` — pour réserver les zones dans la mise en page
 *   - `sealing.ts`             — pour les champs posés avant le 1er scellement
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
 * MESURÉS, pas devinés : `npx tsx scripts/measure-signature-rects.ts` rend le
 * composant avec un aplat de couleur dans chaque zone, puis relève les
 * coordonnées du rectangle DANS LE FLUX DE CONTENU du PDF, matrices de
 * transformation composées. Aucune rasterisation, aucune approximation.
 * Ne jamais les recalculer à la main — REJOUER LE SCRIPT.
 *
 * ⚠️ CES VALEURS NE SONT CONSTANTES QUE PARCE QUE LA MISE EN PAGE EST INVARIANTE.
 * Trois dispositifs le garantissent en mode `forSealing`, tous indispensables :
 *   1. un espaceur `flexGrow: 1` épingle le bloc signature au bas de page, sinon
 *      il remonte quand la note compte peu de postes ;
 *   2. le bloc de métadonnées a une hauteur FIXE (`metaFixe`), sinon la zone de
 *      tracé se déplace selon la présence du hash ou de la date de validation ;
 *   3. le pied de page a une hauteur FIXE et reste rendu même sans logo — que
 *      `loadLogo()` peut ne pas fournir — sinon tout le bloc remonte d'autant.
 *
 * Vérifié identique pour 1 et 9 postes, avec et sans hash, note validée ou non.
 * Un widget mal placé est FIGÉ PAR DocMDP : il n'est plus corrigeable après coup.
 */
export const SIGNATURE_WIDGET_RECTS = {
    /** Colonne « Le demandeur : » — signature #1 (D10 : widget, pas contenu). */
    demandeur: [86, 205.5, 222.4, 249.5] as const,
    /** Colonne « Le responsable : » — signature #2. */
    valideur: [236.4, 205.5, 372.8, 249.5] as const,
    /**
     * Signature #3 (payeur) : AUCUN widget visible.
     * Le champ existe — il doit être créé comme les autres avant le scellement —
     * mais son rectangle est nul, donc rien n'est rendu sur la page.
     */
    payeur: null,
} as const;

/**
 * Couleurs d'aplat posées par `ExpensePdfDocument` en mode `measureZones`, une
 * par colonne de signature. Composantes de l'opérateur PDF `scn`.
 *
 * Servent à `scripts/measure-signature-rects.ts` et au test qui verrouille la
 * correspondance entre le rendu et `SIGNATURE_WIDGET_RECTS`.
 */
export const MEASURE_ZONE_COLORS = {
    demandeur: '1 0 0',
    valideur: '0 1 0',
} as const;

/**
 * Les trois champs de signature, posés d'un coup AVANT le premier scellement.
 *
 * ⚠️ L'ORDRE ET LES NOMS SONT CONTRACTUELS : `sealStep1/2/3` remplissent
 * respectivement `Signature1`, `Signature2` et `Signature3`. Un champ ne peut
 * pas être ajouté après la certification sans invalider les signatures déjà
 * posées aux yeux d'Acrobat.
 */
export const SIGNATURE_FIELDS = [
    { name: 'Signature1', rect: SIGNATURE_WIDGET_RECTS.demandeur },
    { name: 'Signature2', rect: SIGNATURE_WIDGET_RECTS.valideur },
    { name: 'Signature3', rect: SIGNATURE_WIDGET_RECTS.payeur },
] as const;

/** Convertit une ordonnée « depuis le haut de page » en ordonnée PDF. */
export function toPdfY(yFromTop: number, height: number): number {
    return PAGE_HEIGHT - yFromTop - height;
}

/**
 * Nombre maximal de postes de dépense tenant sur une seule page.
 *
 * Le modèle « septembre 2023 » en fait tenir 9, contre 14 sur le précédent :
 * ses marges de 72 pt et sa colonne « Date et objet » étroite coûtent de la
 * hauteur. Décision D6 : au-delà, le scellement est REFUSÉ (400) plutôt que de
 * produire un document cassé — le bloc signature partirait en page 2 alors que le widget est
 * toujours posé sur la page 1 (`addSignatureFields` n'annote que celle-ci).
 *
 * ⚠️ Valeur DÉRIVÉE, pas devinée : `signature-layout.test.ts` rend le composant à
 * MAX_ITEMS_SINGLE_PAGE puis à MAX_ITEMS_SINGLE_PAGE + 1 et vérifie le basculement
 * à 2 pages. Toute modification de la mise en page du PDF casse ce test et donne
 * la nouvelle valeur, au lieu de laisser passer un document invalide.
 */
export const MAX_ITEMS_SINGLE_PAGE = 9;

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
