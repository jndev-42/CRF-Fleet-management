// @vitest-environment node
/**
 * Chaîne de scellement RÉELLE des notes de frais, circuit RESPO puis président.
 *
 * Contrairement à `expenses.test.ts`, qui mocke `sealing` pour la vitesse, ce
 * fichier signe pour de vrai : rendu du PDF depuis la base de test, champs posés,
 * PKCS#7, puis vérification des condensats par `verifySignatures`. Seul R2 —
 * service externe — est remplacé par un magasin en mémoire.
 *
 * Couvre les critères d'acceptation de la spec :
 *   - v2 validée par un RESPO puis le président → 3 signatures valides ;
 *   - v2 validée en combiné par le président → 2 révisions du même signataire ;
 *   - note v1 (3 champs) → le président valide en une étape, sans erreur.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const store = new Map<string, Buffer>();
let attempt = 0;

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/lib/r2', () => ({
    getObject: vi.fn(async (key: string) => store.get(key) ?? null),
    putObject: vi.fn(async (key: string, buf: Buffer) => { store.set(key, buf); }),
    buildExpenseKey: (id: string, rev: number, att: string) => `${id}/v${rev}-${att}.pdf`,
    newAttemptId: () => `a${++attempt}`,
}));

import sharp from 'sharp';
import { installTestCert } from '../fixtures/signing-cert';
import { db, seedUser } from './setup';
import { putObject } from '@/lib/r2';
import {
    sealStep1, sealStep2, sealStep3, sealPresident, composePresidentAppearance,
    CURRENT_WORKFLOW_VERSION, RevisionMismatchError,
} from '@/lib/expenses/sealing';
import { persistSealed, PersistSealError } from '@/lib/expenses/persist-seal';
import { verifySignatures } from '@/lib/pdf/verify';
import { sealPdf } from '@/lib/pdf/signature';
import { addSignatureFields } from '@/lib/pdf/fields';
import { generateExpensePdf } from '@/lib/expenses/pdf';
import { SIGNATURE_FIELDS, SIGNATURE_WIDGET_RECTS } from '@/lib/expenses/signature-layout';

installTestCert();

let signaturePng = '';
let stampPng = '';

const demandeur = () => ({ id: 'u-dem', name: 'Jean Demandeur', signatureImage: signaturePng });
const respo = () => ({ id: 'u-respo', name: 'Rita Respo', signatureImage: signaturePng });
const president = () => ({ id: 'u-pres', name: 'Paul President', signatureImage: signaturePng });

/** Rectangle tel que `verifySignatures` le restitue. */
const rectString = (r: readonly number[]) => `[${r.join(' ')}]`;

async function seedDraft(id: string): Promise<void> {
    await db.execute({
        sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund, missionName, missionDate)
              VALUES (?, 'u-dem', '2026-10-20T10:00:00Z', 'brouillon', 'DLUS', 25, ?, 'ul-paris-18', 1, 'Maraude', '2026-10-19')`,
        args: [id, JSON.stringify([{ label: 'Péage', amount: 25 }])],
    });
}

async function submit(id: string): Promise<void> {
    const seal = await sealStep1(id, demandeur());
    await persistSealed({ reportId: id, seal, expectedStatus: 'brouillon', nextStatus: 'soumis' });
}

async function storedPdf(id: string): Promise<Buffer> {
    const row = (await db.execute({ sql: 'SELECT r2Key FROM "ExpenseReport" WHERE id = ?', args: [id] })).rows[0];
    const buf = store.get(row.r2Key as string);
    if (!buf) throw new Error(`PDF absent du magasin pour ${id}`);
    return buf;
}

async function revisions(id: string): Promise<{ step: number; signerId: string; role: string; r2Key: string }[]> {
    const row = (await db.execute({ sql: 'SELECT signatureRevisions FROM "ExpenseReport" WHERE id = ?', args: [id] })).rows[0];
    return JSON.parse(row.signatureRevisions as string);
}

beforeAll(async () => {
    const sig = await sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80">
           <text x="10" y="50" font-size="28" fill="#1a1a8c">Signature</text></svg>`
    )).png().toBuffer();
    signaturePng = `data:image/png;base64,${sig.toString('base64')}`;

    // Tampon : un aplat rouge, facile à repérer dans l'apparence composée.
    const stamp = await sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 220, g: 0, b: 0, alpha: 1 } } })
        .png().toBuffer();
    stampPng = `data:image/png;base64,${stamp.toString('base64')}`;
});

beforeEach(async () => {
    store.clear();
    vi.mocked(putObject).mockClear();
    await db.execute('DELETE FROM "ExpenseReport"');
    await db.execute({
        sql: `INSERT OR REPLACE INTO "UniteLocale" (id, name, slug, stampImage) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18', ?)`,
        args: [stampPng],
    });
    for (const [id, name] of [['u-dem', 'Jean Demandeur'], ['u-respo', 'Rita Respo'], ['u-pres', 'Paul President'], ['u-tres', 'Tom Tresorier']]) {
        await db.execute({ sql: 'DELETE FROM "User" WHERE id = ?', args: [id] });
        await seedUser({ id, email: `${id}@test.com`, name });
    }
});

describe('scellement #1 — quatre champs et circuit v2', () => {
    it('pose Signature4 sur la colonne tampon et écrit workflowVersion 2', async () => {
        await seedDraft('n-1');
        await submit('n-1');

        const row = (await db.execute({ sql: 'SELECT status, workflowVersion FROM "ExpenseReport" WHERE id = ?', args: ['n-1'] })).rows[0];
        expect(row.status).toBe('soumis');
        expect(Number(row.workflowVersion)).toBe(CURRENT_WORKFLOW_VERSION);

        const pdf = await storedPdf('n-1');
        const text = pdf.toString('latin1');
        for (const { name } of SIGNATURE_FIELDS) expect(text).toContain(`/T (${name})`);
        expect(verifySignatures(pdf).rects).toContain(rectString(SIGNATURE_WIDGET_RECTS.president));
    }, 60_000);

    it('n\'imprime PAS le tampon dans le formulaire scellé', async () => {
        await seedDraft('n-2');
        const avecTampon = await generateExpensePdf('n-2', { forSealing: true });
        await db.execute(`UPDATE "UniteLocale" SET stampImage = NULL WHERE id = 'ul-paris-18'`);
        const sansTampon = await generateExpensePdf('n-2', { forSealing: true });

        const images = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length;
        expect(images(avecTampon)).toBe(images(sansTampon));
    }, 60_000);

    it('la disposition v1 (scellement rétroactif) imprime toujours le tampon', async () => {
        await seedDraft('n-2b');
        const images = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length;
        const v2 = await generateExpensePdf('n-2b', { forSealing: true });
        const v1 = await generateExpensePdf('n-2b', { forSealing: true, legacyLayout: true });
        // Le PNG du tampon peut compter deux objets (image + masque de transparence).
        expect(images(v1)).toBeGreaterThan(images(v2));
    }, 60_000);
});

describe('circuit RESPO puis président', () => {
    it('RESPO puis président : 3 signatures valides, révisions 1, 2, 4', async () => {
        await seedDraft('n-3');
        await submit('n-3');

        const respoSeal = await sealStep2('n-3', respo());
        await persistSealed({ reportId: 'n-3', seal: respoSeal, expectedStatus: 'soumis', nextStatus: 'valide_respo' });

        const presSeal = await sealPresident('n-3', president());
        await persistSealed({ reportId: 'n-3', seal: presSeal, expectedStatus: 'valide_respo', nextStatus: 'en_attente_paiement' });

        const report = verifySignatures(await storedPdf('n-3'));
        expect(report.revisions).toBe(3);
        expect(report.allValid).toBe(true);
        expect(report.signatures.map(s => s.name)).toEqual(['Jean Demandeur', 'Rita Respo', 'Paul President']);
        // Aucun champ ajouté après la certification : quatre rectangles distincts au plus.
        expect(new Set(report.rects).size).toBe(4);

        const log = await revisions('n-3');
        expect(log.map(r => r.step)).toEqual([1, 2, 4]);
        expect(log[1].role).toBe('Responsable d\'activité');
        expect(log[2].role).toBe('Président');

        // Le paiement, inchangé, s'ajoute ensuite.
        const paySeal = await sealStep3('n-3', { id: 'u-tres', name: 'Tom Tresorier' });
        await persistSealed({ reportId: 'n-3', seal: paySeal, expectedStatus: 'en_attente_paiement', nextStatus: 'traité' });
        const paid = verifySignatures(await storedPdf('n-3'));
        expect(paid.revisions).toBe(4);
        expect(paid.allValid).toBe(true);
    }, 90_000);

    it('signature combinée du président : deux révisions, une seule écriture R2, 3 signatures valides', async () => {
        await seedDraft('n-4');
        await submit('n-4');
        vi.mocked(putObject).mockClear();

        const respoSeal = await sealStep2('n-4', president());
        const presSeal = await sealPresident('n-4', president(), { after: respoSeal });
        await persistSealed({
            reportId: 'n-4', seal: [respoSeal, presSeal],
            expectedStatus: 'soumis', nextStatus: 'en_attente_paiement',
        });

        expect(vi.mocked(putObject)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(putObject)).toHaveBeenCalledWith(presSeal.key, presSeal.buffer);

        const log = await revisions('n-4');
        expect(log.map(r => r.step)).toEqual([1, 2, 4]);
        expect(log[1].signerId).toBe('u-pres');
        expect(log[2].signerId).toBe('u-pres');
        // Les deux révisions de la suite pointent vers la seule clé écrite sur R2.
        expect(log[1].r2Key).toBe(presSeal.key);
        expect(log[2].r2Key).toBe(presSeal.key);
        expect(store.has(respoSeal.key)).toBe(false);

        const report = verifySignatures(await storedPdf('n-4'));
        expect(report.revisions).toBe(3);
        expect(report.allValid).toBe(true);
    }, 90_000);

    it('un tampon d\'UL illisible ne bloque pas la validation : signature seule', async () => {
        await seedDraft('n-7');
        await submit('n-7');
        await db.execute(`UPDATE "UniteLocale" SET stampImage = 'data:image/png;base64,bm90IGFuIGltYWdl' WHERE id = 'ul-paris-18'`);
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});

        const respoSeal = await sealStep2('n-7', respo());
        await persistSealed({ reportId: 'n-7', seal: respoSeal, expectedStatus: 'soumis', nextStatus: 'valide_respo' });
        const presSeal = await sealPresident('n-7', president());
        await persistSealed({ reportId: 'n-7', seal: presSeal, expectedStatus: 'valide_respo', nextStatus: 'traité' });

        expect(verifySignatures(await storedPdf('n-7')).allValid).toBe(true);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('illisible'), expect.anything());
        err.mockRestore();
    }, 60_000);

    it('refuse d\'enchaîner sur un buffer qui n\'a pas la signature attendue', async () => {
        await seedDraft('n-5');
        await submit('n-5');
        const respoSeal = await sealStep2('n-5', respo());
        // `after` doit porter UNE signature de plus que le journal : le buffer
        // stocké (une seule) ne convient pas.
        await expect(sealPresident('n-5', president(), { after: { ...respoSeal, buffer: await storedPdf('n-5') } }))
            .rejects.toThrow(RevisionMismatchError);
    }, 60_000);

    it('persistSealed rejette une suite dont un buffer ne prolonge pas le précédent', async () => {
        await seedDraft('n-6');
        await submit('n-6');
        const a = await sealStep2('n-6', respo());
        const forged = { ...a, buffer: Buffer.from('%PDF-1.3 autre document') };
        await expect(persistSealed({
            reportId: 'n-6', seal: [a, forged], expectedStatus: 'soumis', nextStatus: 'valide_respo',
        })).rejects.toThrow(PersistSealError);

        const row = (await db.execute({ sql: 'SELECT status FROM "ExpenseReport" WHERE id = ?', args: ['n-6'] })).rows[0];
        expect(row.status).toBe('soumis');
    }, 60_000);
});

describe('note héritée (v1, trois champs)', () => {
    it('le président valide en une étape dans Signature2, sans erreur de scellement', async () => {
        await seedDraft('n-v1');
        // Reproduit un PDF scellé AVANT l'introduction de Signature4.
        const form = await generateExpensePdf('n-v1', { forSealing: true });
        const prepared = await addSignatureFields(form, SIGNATURE_FIELDS.slice(0, 3));
        const sealed = await sealPdf(prepared, {
            reason: 'Soumission', name: 'Jean Demandeur', signingTime: new Date(),
            fieldName: 'Signature1', appearancePng: Buffer.from(signaturePng.split(',')[1], 'base64'), docMdpLevel: 2,
        });
        store.set('n-v1/v1-legacy.pdf', sealed);
        await db.execute({
            sql: `UPDATE "ExpenseReport" SET status = 'soumis', r2Key = 'n-v1/v1-legacy.pdf', signatureRevisions = ?, workflowVersion = 1 WHERE id = 'n-v1'`,
            args: [JSON.stringify([{ step: 1, role: 'Demandeur' }])],
        });

        const seal = await sealStep2('n-v1', president(), { stage: 'legacy' });
        await persistSealed({ reportId: 'n-v1', seal, expectedStatus: 'soumis', nextStatus: 'en_attente_paiement' });

        const report = verifySignatures(await storedPdf('n-v1'));
        expect(report.revisions).toBe(2);
        expect(report.allValid).toBe(true);
        expect((await revisions('n-v1'))[1]).toMatchObject({ step: 2, role: 'Valideur' });
    }, 60_000);
});

describe('composePresidentAppearance', () => {
    const [x1, y1, x2, y2] = SIGNATURE_WIDGET_RECTS.president;

    async function pixel(png: Buffer, x: number, y: number) {
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        const i = (y * info.width + x) * info.channels;
        return { r: data[i], a: data[i + 3], width: info.width, height: info.height };
    }

    it('produit une image aux proportions du widget', async () => {
        const sig = Buffer.from(signaturePng.split(',')[1], 'base64');
        const { width, height } = await sharp(await composePresidentAppearance(sig, null)).metadata();
        expect(width! / height!).toBeCloseTo((x2 - x1) / (y2 - y1), 1);
    });

    it('place le tampon en fond quand l\'UL en a un, et rien sans tampon', async () => {
        const sig = Buffer.from(signaturePng.split(',')[1], 'base64');
        const stamp = Buffer.from(stampPng.split(',')[1], 'base64');

        // Bord gauche, mi-hauteur : couvert par le tampon, jamais par la signature.
        const withStamp = await pixel(await composePresidentAppearance(sig, stamp), 20, 132);
        expect(withStamp.a).toBe(255);
        expect(withStamp.r).toBeGreaterThan(200);

        const withoutStamp = await pixel(await composePresidentAppearance(sig, null), 20, 132);
        expect(withoutStamp.a).toBe(0);
    });
});
