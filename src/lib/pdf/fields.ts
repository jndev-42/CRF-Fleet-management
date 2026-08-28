/**
 * Création des champs de signature AVANT le premier scellement.
 *
 * ⚠️ POURQUOI EN AMONT. La signature de certification (DocMDP P=2) n'autorise
 * après elle que le remplissage de champs PRÉEXISTANTS. Créer un champ à chaque
 * passe — ce que fait `@signpdf/placeholder-plain` — modifie l'`/AcroForm` et les
 * annotations de la page : Acrobat invalide alors les signatures antérieures, en
 * annonçant des modifications, alors que les condensats sont intacts.
 *
 * Les trois champs sont donc posés d'un coup sur le document non signé. Chaque
 * scellement se contente ensuite d'en remplir un.
 *
 * ⚠️ `useObjectStreams: false` EST OBLIGATOIRE, comme partout dans cette chaîne :
 * la pose d'emplacement travaille sur une table xref classique, absente d'un PDF
 * à flux de références croisées.
 */

import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';

export class SignatureFieldError extends Error {}

export interface SignatureFieldSpec {
    /** Nom du champ (`/T`), unique dans le document. */
    name: string;
    /** Rectangle du widget en points PDF, ou `null` pour une signature invisible. */
    rect: readonly number[] | null;
}

/**
 * Pose les champs de signature sur la première page d'un document non signé.
 *
 * @throws {SignatureFieldError} si le document porte déjà un formulaire — un
 * justificatif joint a pu en apporter un, et deux `/AcroForm` concurrents
 * rendraient les champs inatteignables.
 */
export async function addSignatureFields(
    pdf: Buffer,
    fields: SignatureFieldSpec[]
): Promise<Buffer> {
    const noms = new Set(fields.map(f => f.name));
    if (noms.size !== fields.length) {
        throw new SignatureFieldError('Deux champs de signature portent le même nom.');
    }

    const doc = await PDFDocument.load(pdf);
    if (doc.catalog.get(PDFName.of('AcroForm'))) {
        throw new SignatureFieldError(
            'Le document porte déjà un /AcroForm : les champs de signature ne peuvent pas ' +
            'être posés sans risquer de rendre les nôtres inatteignables.'
        );
    }

    const page = doc.getPage(0);
    const refs = fields.map(({ name, rect }) => {
        // Une signature invisible est un widget de surface nulle : l'entrée
        // existe dans le formulaire, mais rien n'est rendu sur la page.
        const box = rect ?? [0, 0, 0, 0];
        const ref = doc.context.register(doc.context.obj({
            Type: 'Annot',
            Subtype: 'Widget',
            FT: 'Sig',
            Rect: box.map(n => PDFNumber.of(n)),
            T: PDFString.of(name),
            // /F 4 = impression : le widget suit le document à l'impression.
            F: 4,
            P: page.ref,
        }));
        page.node.addAnnot(ref);
        return ref;
    });

    // /SigFlags 3 = SignaturesExist + AppendOnly : annonce aux lecteurs que le
    // document ne doit être modifié que par incremental update.
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(doc.context.obj({
        Type: 'AcroForm',
        SigFlags: 3,
        Fields: refs,
    })));

    return Buffer.from(await doc.save({ useObjectStreams: false }));
}
