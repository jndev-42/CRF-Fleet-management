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
import sharp, { type OverlayOptions } from 'sharp';
import { generateExpensePdf, countItems } from './pdf';
import { appendJustificatifs, type JustificatifFile } from './attachments';
import {
    SIGNATURE_FIELDS, SIGNATURE_FIELD_INDEX, SIGNATURE_WIDGET_RECTS, assertPageGeometry, MAX_ITEMS_SINGLE_PAGE,
    presidentAppearanceLayout, type Box,
} from './signature-layout';
import { addSignatureFields } from '@/lib/pdf/fields';

/**
 * Version du circuit de validation écrite au scellement #1.
 *
 * 1 : ancien circuit — le président valide en une étape, dans `Signature2`. Le PDF
 *     ne porte que trois champs : c'est le cas de toute note soumise avant
 *     l'introduction de l'étape « responsable d'activité ».
 * 2 : le RESPO signe `Signature2`, puis le président `Signature4` (avec le tampon).
 */
export const CURRENT_WORKFLOW_VERSION = 2;

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
    /**
     * Colonnes que la persistance doit écrire avec ce scellement — par exemple
     * `workflowVersion`, qui dépend de la disposition des champs posée ici.
     */
    columns?: Record<string, string | number | null>;
}

/**
 * Entrée du journal `signatureRevisions`.
 *
 * Steps : 1 demandeur, 2 responsable d'activité (ou valideur unique de l'ancien
 * circuit), 3 payeur, 4 président. Le rôle `'Valideur'` est conservé pour les
 * notes v1 : le journal reste lisible tel qu'il a été écrit.
 */
export interface SignatureRevision {
    step: 1 | 2 | 3 | 4;
    signerId: string;
    signerName: string;
    role: 'Demandeur' | 'Valideur' | 'Responsable d\'activité' | 'Président' | 'Payeur';
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
        sql: `SELECT id, ulId, items, r2Key, signatureRevisions, status, submittedAt, validatedAt,
                     respoValidatedAt, paidAt
              FROM "ExpenseReport" WHERE id = ?`,
        args: [reportId],
    });
    if (!res.rows[0]) throw new SealingError('Note de frais non trouvée');
    return res.rows[0];
}

/**
 * Document sur lequel poser la prochaine signature.
 *
 * Sans `after` : le PDF stocké sur R2, dont le nombre de signatures doit égaler
 * celui du journal en base. Avec `after` : le résultat d'un scellement ENCHAÎNÉ EN
 * MÉMOIRE, pas encore persisté — il porte une signature de plus que le journal.
 * C'est ce qui permet au président de signer deux étapes d'un coup avec une
 * seule écriture R2 (`persistSealed` reçoit alors la suite des scellements).
 */
async function loadSealedBase(row: Record<string, unknown>, after?: SealResult): Promise<Buffer> {
    const logged = parseRevisions(row.signatureRevisions).length;
    if (after) {
        assertRevisionCount(after.buffer, logged + 1);
        return after.buffer;
    }

    const currentKey = row.r2Key as string | null;
    if (!currentKey) throw new SealingError('Aucun PDF scellé n\'est associé à cette note.');

    const stored = await getObject(currentKey);
    if (!stored) throw new SealingError(`Objet R2 introuvable : ${currentKey}`);

    assertRevisionCount(stored, logged);
    return stored;
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

    // ⚠️ LES QUATRE CHAMPS SONT POSÉS MAINTENANT, sur le document encore non signé.
    // La certification qui suit n'autorisera plus que le remplissage de champs
    // existants : un champ ajouté plus tard invaliderait, aux yeux d'Acrobat,
    // toutes les signatures déjà en place.
    const prepared = await addSignatureFields(pdf, [...SIGNATURE_FIELDS]);

    const sealed = await sealPdf(prepared, {
        reason: 'Soumission de la note de frais par le demandeur',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[SIGNATURE_FIELD_INDEX.demandeur].name,
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
        // Le document porte désormais `Signature4` : la note suit le nouveau circuit.
        columns: { workflowVersion: CURRENT_WORKFLOW_VERSION },
    };
}

export interface Step2Options {
    rejected?: boolean;
    /**
     * `'respo'` (défaut) : étape « responsable d'activité » du circuit v2.
     * `'legacy'` : validation unique par le président d'une note v1 — même
     * champ `Signature2`, mais journalisée sous le rôle historique `Valideur`.
     */
    stage?: 'respo' | 'legacy';
}

/**
 * Scellement #2 — validation ou refus à l'étape « responsable d'activité »
 * (champ `Signature2`, colonne « Le responsable »). Sert aussi la validation
 * unique de l'ancien circuit (`stage: 'legacy'`).
 *
 * Le refus est lui aussi signé (décision D5) : il clôt définitivement le document.
 */
export async function sealStep2(
    reportId: string,
    signer: Signer,
    opts: Step2Options = {},
    now: Date = new Date()
): Promise<SealResult> {
    const row = await loadReport(reportId);
    const stored = await loadSealedBase(row);

    const image = decodeSignatureImage(signer.signatureImage);
    if (!image) {
        throw new SealingError('La signature du valideur est requise.');
    }

    const legacy = opts.stage === 'legacy';
    const reason = legacy
        ? (opts.rejected ? 'Refus de la note de frais par le valideur' : 'Validation de la note de frais')
        : (opts.rejected
            ? 'Refus de la note de frais par le responsable d\'activité'
            : 'Validation de la note de frais par le responsable d\'activité');

    const sealed = await sealPdf(stored, {
        reason,
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[SIGNATURE_FIELD_INDEX.respo].name,
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
            role: legacy ? 'Valideur' : 'Responsable d\'activité',
            signedAt: now.toISOString(),
            businessDate: ((legacy ? row.validatedAt : row.respoValidatedAt) as string) || null,
            r2Key: key,
        },
    };
}

/** Taille, en pixels, de l'apparence composée du président : 4 px par point PDF. */
const PRESIDENT_APPEARANCE_SCALE = 4;

/** Rogne la marge transparente (ou blanche) d'une image ; la rend telle quelle si rien n'est à rogner. */
async function trimmed(image: Buffer): Promise<Buffer> {
    try {
        return await sharp(image).trim().png().toBuffer();
    } catch {
        // Image uniforme : rien à rogner.
        return sharp(image).png().toBuffer();
    }
}

/**
 * Compose l'apparence du widget président sur une seule image PNG : le tampon de
 * l'UL (s'il existe) et la signature, CÔTE À CÔTE ou empilés, jamais superposés
 * (`presidentAppearanceLayout`). Sans tampon, la signature est centrée seule.
 *
 * Le tampon est d'abord ROGNÉ : `compressStampImage` le stocke dans un cadre
 * 400×200 à marges transparentes, qui sinon lui volerait une partie de la place.
 *
 * L'image est produite AUX PROPORTIONS DU WIDGET : `buildAppearance` l'étire sur
 * tout le rectangle, et une image d'un autre ratio y serait déformée.
 */
export async function composePresidentAppearance(signature: Buffer, stamp: Buffer | null): Promise<Buffer> {
    const [x1, y1, x2, y2] = SIGNATURE_WIDGET_RECTS.president;
    const width = Math.round((x2 - x1) * PRESIDENT_APPEARANCE_SCALE);
    const height = Math.round((y2 - y1) * PRESIDENT_APPEARANCE_SCALE);
    const transparent = { r: 255, g: 255, b: 255, alpha: 0 };
    const sig = await trimmed(signature);

    const fit = async (image: Buffer, box: Box): Promise<OverlayOptions> => {
        const resized = await sharp(image)
            .resize(box.width, box.height, { fit: 'inside' })
            .png()
            .toBuffer({ resolveWithObject: true });
        return {
            input: resized.data,
            // Centré dans sa boîte : `inside` peut rendre une image plus petite qu'elle.
            left: box.left + Math.floor((box.width - resized.info.width) / 2),
            top: box.top + Math.floor((box.height - resized.info.height) / 2),
        };
    };

    const layers: OverlayOptions[] = [];
    if (stamp) {
        const stampImg = await trimmed(stamp);
        const meta = await sharp(stampImg).metadata();
        const layout = presidentAppearanceLayout(width, height, { width: meta.width ?? 1, height: meta.height ?? 1 });
        layers.push(await fit(stampImg, layout.stamp), await fit(sig, layout.signature));
    } else {
        // Sans tampon : la signature seule, centrée, avec une marge.
        const box = {
            left: Math.round(width * 0.05), top: Math.round(height * 0.125),
            width: Math.round(width * 0.9), height: Math.round(height * 0.75),
        };
        layers.push(await fit(sig, box));
    }

    return sharp({ create: { width, height, channels: 4, background: transparent } })
        .composite(layers)
        .png()
        .toBuffer();
}

/** Tampon de l'UL de la note, décodé — `null` si l'UL n'en a pas configuré. */
async function loadStamp(ulId: unknown): Promise<Buffer | null> {
    if (typeof ulId !== 'string' || !ulId) return null;
    const res = await db.execute({
        sql: `SELECT stampImage FROM "UniteLocale" WHERE id = ?`,
        args: [ulId],
    });
    return decodeSignatureImage((res.rows[0]?.stampImage as string | null) ?? null);
}

export interface PresidentOptions {
    /** Refus : signé, définitif, et SANS tampon. */
    rejected?: boolean;
    /**
     * Scellement précédent, enchaîné en mémoire et pas encore persisté : c'est
     * la signature combinée, où le président signe d'abord l'étape RESPO.
     */
    after?: SealResult;
}

/**
 * Scellement #4 — validation ou refus par le président (champ `Signature4`,
 * colonne « Tampon de la structure »).
 *
 * À la validation, l'apparence porte le tampon de l'UL et la signature ensemble.
 * Le tampon n'apparaît donc que sur une note effectivement validée.
 */
export async function sealPresident(
    reportId: string,
    signer: Signer,
    opts: PresidentOptions = {},
    now: Date = new Date()
): Promise<SealResult> {
    const row = await loadReport(reportId);
    const stored = await loadSealedBase(row, opts.after);

    const image = decodeSignatureImage(signer.signatureImage);
    if (!image) {
        throw new SealingError('La signature du président est requise.');
    }

    const stamp = opts.rejected ? null : await loadStamp(row.ulId);
    let appearance: Buffer;
    try {
        appearance = await composePresidentAppearance(image, stamp);
    } catch (e: unknown) {
        if (!stamp) throw e;
        // Un tampon illisible ne doit pas bloquer la validation : la signature
        // seule reste apposée, et l'anomalie est journalisée pour correction.
        console.error(`[expenses] tampon de l'UL ${String(row.ulId)} illisible — signature seule`, e);
        appearance = await composePresidentAppearance(image, null);
    }

    const sealed = await sealPdf(stored, {
        reason: opts.rejected
            ? 'Refus de la note de frais par le président'
            : 'Validation de la note de frais par le président',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[SIGNATURE_FIELD_INDEX.president].name,
        appearancePng: appearance,
    });

    const key = buildExpenseKey(reportId, 4, newAttemptId());
    return {
        buffer: sealed,
        key,
        revision: {
            step: 4,
            signerId: signer.id,
            signerName: signer.name,
            role: 'Président',
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
    const stored = await loadSealedBase(row);

    const sealed = await sealPdf(stored, {
        reason: 'Paiement de la note de frais',
        name: signer.name,
        signingTime: now,
        fieldName: SIGNATURE_FIELDS[SIGNATURE_FIELD_INDEX.payeur].name,
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
export function appendRevision(existing: unknown, ...revisions: SignatureRevision[]): string {
    return JSON.stringify([...parseRevisions(existing), ...revisions]);
}
