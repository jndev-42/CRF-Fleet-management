/**
 * Orchestration du scellement des notes de frais.
 *
 * Ce module NE TOUCHE PAS À LA BASE : il produit un buffer scellé et la clé R2 où
 * l'écrire. C'est l'appelant (route API ou script de backfill) qui décide de la
 * transaction, afin que l'ordre `PUT R2` puis `UPDATE` reste sous son contrôle.
 *
 * ORDRE IMPOSÉ chez l'appelant :
 *   GET R2 → sceller → PUT R2 (clé NEUVE) → db.transaction('write') { UPDATE }
 *
 * Le PUT précède l'écriture en base et porte une clé qui n'existait pas : il ne
 * peut rien détruire. Si la transaction échoue ensuite, l'objet reste orphelin —
 * inoffensif et ignoré, puisque seul le `r2Key` en base fait foi.
 *
 * L'ordre inverse (UPDATE puis PUT) exigerait une compensation après panne, or
 * une compensation ne s'exécute pas sur un lambda tué.
 */

import { db } from '@/lib/db';
import { getObject, buildExpenseKey, newAttemptId } from '@/lib/r2';
import { sealPdf, decodeSignatureImage } from '@/lib/pdf/signature';
import { countRevisions } from '@/lib/pdf/incremental';
import { countPages } from '@/lib/pdf/verify';
import { generateExpensePdf, countItems } from './pdf';
import { appendJustificatifs, type JustificatifFile } from './attachments';
import { SIGNATURE_FIELDS, assertPageGeometry, MAX_ITEMS_SINGLE_PAGE } from './signature-layout';
import { addSignatureFields } from '@/lib/pdf/fields';

export class SealingError extends Error {}
/** Incohérence entre le journal en base et le PDF réellement stocké. */
export class RevisionMismatchError extends SealingError {}
/** Note trop longue pour tenir sur une page — décision D6. */
export class TooManyItemsError extends SealingError {}

export interface SealResult {
    buffer: Buffer;
    /** Clé R2 NEUVE où écrire ce buffer. */
    key: string;
    /** Entrée à ajouter au journal `signatureRevisions`. */
    revision: SignatureRevision;
}

export interface SignatureRevision {
    step: 1 | 2 | 3;
    signerId: string;
    signerName: string;
    role: 'Demandeur' | 'Valideur' | 'Payeur';
    /** Instant réel du scellement — jamais antidaté (décision D7). */
    signedAt: string;
    /** Date métier de l'événement, distincte quand la note est scellée a posteriori. */
    businessDate: string | null;
    r2Key: string;
}

interface Signer {
    id: string;
    name: string;
    /** Image de signature du front (`data:image/png;base64,…`). */
    signatureImage?: string | null;
}

/**
 * Garde-fou D6 : refuse de sceller un FORMULAIRE qui déborderait sur deux pages.
 *
 * Le widget est toujours estampillé sur la PREMIÈRE page (`getPageRef` de
 * `@signpdf/placeholder-plain` retourne la première référence de `/Kids`), alors
 * que le bloc signature partirait en page 2. Le résultat serait figé par DocMDP.
 *
 * ⚠️ Appeler UNIQUEMENT sur le formulaire seul, AVANT `appendJustificatifs` : le
 * document final compte légitimement plusieurs pages (une par justificatif), ce
 * n'est pas ce que ce garde-fou vérifie.
 */
function assertSinglePage(formPdf: Buffer, itemCount: number): void {
    if (itemCount > MAX_ITEMS_SINGLE_PAGE) {
        throw new TooManyItemsError(
            `Cette note comporte ${itemCount} postes de dépense ; le maximum est ${MAX_ITEMS_SINGLE_PAGE} ` +
            `pour tenir sur une page. Merci de la scinder en plusieurs notes.`
        );
    }
    const pages = countPages(formPdf);
    if (pages !== 1) {
        throw new TooManyItemsError(
            `Le PDF généré compte ${pages} pages alors qu'une seule est attendue. Scellement refusé.`
        );
    }
}

/** Vérifie que le PDF stocké porte bien le nombre de signatures annoncé par la base. */
function assertRevisionCount(pdf: Buffer, expected: number): void {
    const actual = countRevisions(pdf);
    if (actual !== expected) {
        throw new RevisionMismatchError(
            `Le PDF stocké porte ${actual} signature(s) alors que le journal en annonce ${expected}. ` +
            `Scellement refusé — utiliser \`verify-signed-pdf.ts --reconcile\` pour diagnostiquer.`
        );
    }
}

async function loadReport(reportId: string) {
    const res = await db.execute({
        sql: `SELECT id, items, r2Key, signatureRevisions, status, submittedAt, validatedAt, paidAt
              FROM "ExpenseReport" WHERE id = ?`,
        args: [reportId],
    });
    if (!res.rows[0]) throw new SealingError('Note de frais non trouvée');
    return res.rows[0];
}

function parseRevisions(raw: unknown): SignatureRevision[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Récupère depuis R2 les justificatifs déposés pendant qu'une note était encore
 * un brouillon, prêts à être passés à `sealStep1`.
 *
 * Le type MIME se déduit de l'extension de la clé (`.pdf` sinon image), reflet
 * de ce que `/api/expenses/upload` y a écrit — ce dépôt ne stocke rien d'autre.
 *
 * @throws {SealingError} si une clé annoncée en base est absente de R2 : mieux
 * vaut refuser la soumission qu'accepter silencieusement une note incomplète.
 */
export async function resolvePendingReceipts(keys: string[]): Promise<JustificatifFile[]> {
    return Promise.all(keys.map(async (key) => {
        const buffer = await getObject(key);
        if (!buffer) {
            throw new SealingError(`Justificatif introuvable sur R2 (${key}) — soumission refusée.`);
        }
        const mime = key.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        return { buffer, mime };
    }));
}

/**
 * Scellement #1 — soumission par le demandeur.
 *
 * Pose la signature de certification avec la règle DocMDP P=2, qui verrouille le
 * contenu textuel pour toute la suite.
 */
export async function sealStep1(
    reportId: string,
    signer: Signer,
    now: Date = new Date(),
    attachments: JustificatifFile[] = []
): Promise<SealResult> {
    const row = await loadReport(reportId);
    const itemCount = countItems(row.items as string);

    const image = decodeSignatureImage(signer.signatureImage);
    if (!image) {
        throw new SealingError('La signature du demandeur est requise pour sceller la note.');
    }

    const form = await generateExpensePdf(reportId, { forSealing: true });
    assertPageGeometry(form);
    assertSinglePage(form, itemCount);

    // Les justificatifs deviennent des pages du document AVANT le premier
    // scellement : c'est ce document, pages comprises, que DocMDP verrouille.
    const pdf = await appendJustificatifs(form, attachments);

    // ⚠️ LES TROIS CHAMPS SONT POSÉS MAINTENANT, sur le document encore non signé.
    // La certification qui suit n'autorisera plus que le remplissage de champs
    // existants : un champ ajouté plus tard invaliderait, aux yeux d'Acrobat,
    // toutes les signatures déjà en place.
    const prepared = await addSignatureFields(pdf, [...SIGNATURE_FIELDS]);

    const sealed = await sealPdf(prepared, {
        reason: 'Soumission de la note de frais par le demandeur',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[0].name,
        appearancePng: image,
        docMdpLevel: 2,
    });

    const key = buildExpenseKey(reportId, 1, newAttemptId());
    return {
        buffer: sealed,
        key,
        revision: {
            step: 1,
            signerId: signer.id,
            signerName: signer.name,
            role: 'Demandeur',
            signedAt: now.toISOString(),
            businessDate: (row.submittedAt as string) || null,
            r2Key: key,
        },
    };
}

/**
 * Scellement #2 — validation ou refus par le valideur.
 *
 * Le refus est lui aussi signé (décision D5) : il clôt définitivement le document.
 */
export async function sealStep2(
    reportId: string,
    signer: Signer,
    opts: { rejected?: boolean } = {},
    now: Date = new Date()
): Promise<SealResult> {
    const row = await loadReport(reportId);
    const currentKey = row.r2Key as string | null;
    if (!currentKey) throw new SealingError('Aucun PDF scellé n\'est associé à cette note.');

    const stored = await getObject(currentKey);
    if (!stored) throw new SealingError(`Objet R2 introuvable : ${currentKey}`);

    assertRevisionCount(stored, parseRevisions(row.signatureRevisions).length);

    const image = decodeSignatureImage(signer.signatureImage);
    if (!image) {
        throw new SealingError('La signature du valideur est requise.');
    }

    const sealed = await sealPdf(stored, {
        reason: opts.rejected
            ? 'Refus de la note de frais par le valideur'
            : 'Validation de la note de frais',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[1].name,
        appearancePng: image,
    });

    const key = buildExpenseKey(reportId, 2, newAttemptId());
    return {
        buffer: sealed,
        key,
        revision: {
            step: 2,
            signerId: signer.id,
            signerName: signer.name,
            role: 'Valideur',
            signedAt: now.toISOString(),
            businessDate: (row.validatedAt as string) || null,
            r2Key: key,
        },
    };
}

/**
 * Scellement #3 — paiement par le trésorier.
 *
 * AUCUN widget : `widgetRect` omis ⇒ `/Rect [0 0 0 0]`. La signature existe
 * cryptographiquement et figure au panneau Signatures, sans rendu sur la page.
 */
export async function sealStep3(
    reportId: string,
    signer: Signer,
    now: Date = new Date()
): Promise<SealResult> {
    const row = await loadReport(reportId);
    const currentKey = row.r2Key as string | null;
    if (!currentKey) throw new SealingError('Aucun PDF scellé n\'est associé à cette note.');

    const stored = await getObject(currentKey);
    if (!stored) throw new SealingError(`Objet R2 introuvable : ${currentKey}`);

    assertRevisionCount(stored, parseRevisions(row.signatureRevisions).length);

    const sealed = await sealPdf(stored, {
        reason: 'Paiement de la note de frais',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[2].name,
        // Pas d'appearancePng : le champ est de surface nulle, rien n'est rendu.
    });

    const key = buildExpenseKey(reportId, 3, newAttemptId());
    return {
        buffer: sealed,
        key,
        revision: {
            step: 3,
            signerId: signer.id,
            signerName: signer.name,
            role: 'Payeur',
            signedAt: now.toISOString(),
            businessDate: (row.paidAt as string) || null,
            r2Key: key,
        },
    };
}

/** Sérialise le journal de révisions pour la colonne `signatureRevisions`. */
export function appendRevision(existing: unknown, revision: SignatureRevision): string {
    return JSON.stringify([...parseRevisions(existing), revision]);
}
