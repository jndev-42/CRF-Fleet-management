/**
 * Tests d'intégration — chatbot du référentiel secourisme.
 *
 *  POST /api/referentiel/upload     SUPER_ADMIN — ligne `uploading` + URL de dépôt signée
 *  POST /api/referentiel/process    SUPER_ADMIN — indexation par lots, bascule atomique
 *  GET  /api/referentiel            utilisateur actif — état (+ import en cours pour SUPER_ADMIN)
 *  GET  /api/referentiel/search     utilisateur actif — top 5 bm25 avec extrait surligné
 *  GET  /api/referentiel/file-url   utilisateur actif — URL de lecture signée
 *
 * R2 et l'extraction PDF sont mockés ; la base (FTS5 compris) est la vraie.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

const attempts = vi.hoisted(() => ({ n: 0 }));
const head = vi.hoisted(() => ({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) as Uint8Array | null }));
vi.mock('@/lib/r2', () => ({
    buildReferentielKey: (attempt: string) => `referentiels/key-${attempt}.pdf`,
    // Une clé distincte par import, comme en production (UUID).
    newAttemptId: vi.fn(() => `att${++attempts.n}`),
    presignUrl: vi.fn(async (key: string, method: string) => `https://r2.test/${key}?m=${method}&sig=x`),
    getObjectRange: vi.fn(async () => head.bytes),
    deleteObject: vi.fn(async () => undefined),
}));

const extraction = vi.hoisted(() => ({ pageCount: 3 }));
vi.mock('@/lib/referentiel/extract', () => ({
    countPages: vi.fn(async () => extraction.pageCount),
    extractPages: vi.fn(async (_source: unknown, from: number, to: number) => {
        const pages = [];
        for (let page = from; page <= Math.min(to, extraction.pageCount); page++) {
            pages.push({
                page,
                title: page === 2 ? 'Urgences vitales / Hémorragie / IV.B.1' : '',
                body: page === 2
                    ? 'Devant une hémorragie externe, comprimer directement la plaie avec la main.'
                    : `Contenu sans rapport numéro ${page}.`,
            });
        }
        return pages;
    }),
}));

import { auth } from '@/auth';
import { deleteObject, getObjectRange, presignUrl } from '@/lib/r2';
import { countPages, extractPages } from '@/lib/referentiel/extract';
import { POST as upload } from '@/app/api/referentiel/upload/route';
import { POST as processRoute } from '@/app/api/referentiel/process/route';
import { GET as getStatus } from '@/app/api/referentiel/route';
import { GET as search } from '@/app/api/referentiel/search/route';
import { GET as fileUrl } from '@/app/api/referentiel/file-url/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

const SUPER_ADMIN = { user: { id: 'u-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'] } };
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', roles: ['ADMIN'] } };
const VOLUNTEER = { user: { id: 'u-chvl', email: 'chvl@test.com', roles: ['CHVL'] } };
const INACTIVE = { user: { id: 'u-off', email: 'off@test.com', roles: ['INACTIF'] } };

function asSession(s: unknown) {
    mockedAuth.mockResolvedValue(s as never);
}

function post(url: string, body: unknown): Request {
    return new Request(`http://localhost${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

function get(url: string): Request {
    return new Request(`http://localhost${url}`);
}

/** Importe un référentiel complet (upload + process jusqu'à `done`) et renvoie son id. */
async function importReferentiel(): Promise<string> {
    asSession(SUPER_ADMIN);
    const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'guide.pdf' }))).json();
    let fromPage = 1;
    for (;;) {
        const body = await (await processRoute(post('/api/referentiel/process', { id, fromPage }))).json();
        if (body.done) return id;
        fromPage = body.processedPages + 1;
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    attempts.n = 0;
    head.bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    extraction.pageCount = 3;
});

describe('POST /api/referentiel/upload', () => {
    it('401 sans session', async () => {
        asSession(null);
        expect((await upload(post('/api/referentiel/upload', { fileName: 'a.pdf' }))).status).toBe(401);
    });

    it('403 pour un ADMIN non super', async () => {
        asSession(ADMIN);
        expect((await upload(post('/api/referentiel/upload', { fileName: 'a.pdf' }))).status).toBe(403);
    });

    it('403 pour un SUPER_ADMIN bloqué par INACTIF', async () => {
        asSession({ user: { id: 'u', email: 'x@test.com', roles: ['SUPER_ADMIN', 'INACTIF'] } });
        expect((await upload(post('/api/referentiel/upload', { fileName: 'a.pdf' }))).status).toBe(403);
    });

    it('400 si le nom de fichier manque ou si le corps est illisible', async () => {
        asSession(SUPER_ADMIN);
        expect((await upload(post('/api/referentiel/upload', {}))).status).toBe(400);
        expect((await upload(post('/api/referentiel/upload', '{pas du json'))).status).toBe(400);
    });

    it('crée la ligne `uploading` et renvoie une URL PUT signée', async () => {
        asSession(SUPER_ADMIN);
        const res = await upload(post('/api/referentiel/upload', { fileName: 'guide.pdf' }));
        expect(res.status).toBe(200);
        const { id, uploadUrl } = await res.json();
        expect(uploadUrl).toContain('m=PUT');
        expect(presignUrl).toHaveBeenCalledWith('referentiels/key-att1.pdf', 'PUT', 900);

        const row = (await db.execute({ sql: `SELECT status, fileName, createdBy FROM Referentiel WHERE id = ?`, args: [id] })).rows[0];
        expect(row).toMatchObject({ status: 'uploading', fileName: 'guide.pdf', createdBy: 'sa@test.com' });
    });
});

describe('POST /api/referentiel/process', () => {
    it('401 sans session, 403 pour un ADMIN', async () => {
        asSession(null);
        expect((await processRoute(post('/api/referentiel/process', { id: 'x', fromPage: 1 }))).status).toBe(401);
        asSession(ADMIN);
        expect((await processRoute(post('/api/referentiel/process', { id: 'x', fromPage: 1 }))).status).toBe(403);
    });

    it('400 si le corps est invalide', async () => {
        asSession(SUPER_ADMIN);
        expect((await processRoute(post('/api/referentiel/process', { id: 'x' }))).status).toBe(400);
        expect((await processRoute(post('/api/referentiel/process', { id: 'x', fromPage: 0 }))).status).toBe(400);
        expect((await processRoute(post('/api/referentiel/process', { id: 'x', fromPage: 1, extra: 1 }))).status).toBe(400);
    });

    it('404 pour un import inconnu', async () => {
        asSession(SUPER_ADMIN);
        expect((await processRoute(post('/api/referentiel/process', { id: 'inconnu', fromPage: 1 }))).status).toBe(404);
    });

    it('indexe puis active le référentiel, pages et index FTS compris', async () => {
        const id = await importReferentiel();

        const ref = (await db.execute({ sql: `SELECT status, pageCount, processedPages, readyAt FROM Referentiel WHERE id = ?`, args: [id] })).rows[0];
        expect(ref).toMatchObject({ status: 'ready', pageCount: 3, processedPages: 3 });
        expect(ref.readyAt).not.toBeNull();
        expect((await db.execute(`SELECT COUNT(*) AS n FROM ReferentielPage`)).rows[0].n).toBe(3);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM ReferentielFts WHERE ReferentielFts MATCH 'hemorragie'`)).rows[0].n).toBe(1);
    });

    it('rend la main entre les lots et reprend à la page suivante', async () => {
        extraction.pageCount = 200;
        asSession(SUPER_ADMIN);
        const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'g.pdf' }))).json();

        const first = await (await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).json();
        expect(first).toMatchObject({ done: false, processedPages: 80, pageCount: 200, status: 'processing' });
        expect(vi.mocked(extractPages).mock.calls[0].slice(1, 3)).toEqual([1, 80]);

        // Sauter un lot est refusé.
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 150 }))).status).toBe(409);
    });

    it('rejette un fichier non PDF (400), supprime l\'objet R2 et la ligne', async () => {
        head.bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        asSession(SUPER_ADMIN);
        const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'faux.pdf' }))).json();

        const res = await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }));
        expect(res.status).toBe(400);
        expect(deleteObject).toHaveBeenCalledWith('referentiels/key-att1.pdf');
        expect((await db.execute({ sql: `SELECT id FROM Referentiel WHERE id = ?`, args: [id] })).rows).toHaveLength(0);
    });

    it('400 si le fichier n\'a pas été déposé', async () => {
        head.bytes = null;
        asSession(SUPER_ADMIN);
        const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'g.pdf' }))).json();
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).status).toBe(400);
    });

    it('un second import abandonne le traitement en cours (failed)', async () => {
        extraction.pageCount = 200;
        asSession(SUPER_ADMIN);
        const a = (await (await upload(post('/api/referentiel/upload', { fileName: 'a.pdf' }))).json()).id;
        await processRoute(post('/api/referentiel/process', { id: a, fromPage: 1 }));
        const b = (await (await upload(post('/api/referentiel/upload', { fileName: 'b.pdf' }))).json()).id;
        const res = await processRoute(post('/api/referentiel/process', { id: b, fromPage: 1 }));
        expect(res.status).toBe(200);

        const statuses = Object.fromEntries(
            (await db.execute(`SELECT id, status FROM Referentiel`)).rows.map(r => [String(r.id), String(r.status)]),
        );
        expect(statuses[a]).toBe('failed');
        expect(statuses[b]).toBe('processing');
        // L'abandonné ne peut plus avancer.
        expect((await processRoute(post('/api/referentiel/process', { id: a, fromPage: 81 }))).status).toBe(409);
    });

    it('un nouvel import remplace l\'ancien sans fenêtre vide, puis supprime l\'ancien objet R2', async () => {
        const oldId = await importReferentiel();

        extraction.pageCount = 200;
        asSession(SUPER_ADMIN);
        const { id: newId } = await (await upload(post('/api/referentiel/upload', { fileName: 'v2.pdf' }))).json();
        await processRoute(post('/api/referentiel/process', { id: newId, fromPage: 1 }));

        // Import en cours : l'ancien répond toujours.
        asSession(VOLUNTEER);
        const during = await (await search(get('/api/referentiel/search?q=hemorragie'))).json();
        expect(during.results).toHaveLength(1);

        extraction.pageCount = 200;
        asSession(SUPER_ADMIN);
        await processRoute(post('/api/referentiel/process', { id: newId, fromPage: 81 }));
        await processRoute(post('/api/referentiel/process', { id: newId, fromPage: 161 }));
        // Toutes les pages sont indexées mais l'ancien répond encore : la bascule est un appel à part.
        expect((await db.execute({ sql: `SELECT status FROM Referentiel WHERE id = ?`, args: [oldId] })).rows[0].status).toBe('ready');
        await processRoute(post('/api/referentiel/process', { id: newId, fromPage: 201 }));

        const rows = (await db.execute(`SELECT id, status FROM Referentiel`)).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: newId, status: 'ready' });
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM ReferentielPage WHERE referentielId = ?`, args: [oldId] })).rows[0].n).toBe(0);
        expect(deleteObject).toHaveBeenCalledTimes(1);
        expect(deleteObject).toHaveBeenCalledWith('referentiels/key-att1.pdf');
    });
});

describe('POST /api/referentiel/process — bascule séparée', () => {
    it('le dernier lot ne bascule pas ; l\'appel suivant bascule sans rien extraire', async () => {
        asSession(SUPER_ADMIN);
        const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'g.pdf' }))).json();
        const last = await (await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).json();
        expect(last).toMatchObject({ processedPages: 3, pageCount: 3, done: false, status: 'processing' });
        vi.mocked(extractPages).mockClear();

        const switched = await (await processRoute(post('/api/referentiel/process', { id, fromPage: 4 }))).json();
        expect(switched).toMatchObject({ processedPages: 3, pageCount: 3, done: true, status: 'ready' });
        expect(extractPages).not.toHaveBeenCalled();
    });

    it('reprend un import resté `processing` après une coupure (bascule perdue)', async () => {
        asSession(SUPER_ADMIN);
        const { id } = await (await upload(post('/api/referentiel/upload', { fileName: 'g.pdf' }))).json();
        await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }));
        // L'onglet a été fermé : on relit l'état, puis on reprend à processedPages + 1.
        const pending = (await (await getStatus()).json()).pending;
        expect(pending).toMatchObject({ id, status: 'processing', processedPages: 3, pageCount: 3 });
        const res = await (await processRoute(post('/api/referentiel/process', { id, fromPage: pending.processedPages + 1 }))).json();
        expect(res.done).toBe(true);
    });
});

describe('POST /api/referentiel/process — échecs, lots courts, classement, bascule', () => {
    async function startImport(): Promise<string> {
        asSession(SUPER_ADMIN);
        return (await (await upload(post('/api/referentiel/upload', { fileName: 'g.pdf' }))).json()).id;
    }

    async function rowOf(id: string) {
        return (await db.execute({ sql: `SELECT status FROM Referentiel WHERE id = ?`, args: [id] })).rows[0];
    }

    it('400 et import `failed` si le PDF est illisible', async () => {
        const id = await startImport();
        vi.mocked(countPages).mockRejectedValueOnce(new Error('Invalid PDF structure'));
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).status).toBe(400);
        expect((await rowOf(id)).status).toBe('failed');
    });

    it('400 et import `failed` si le PDF n\'a aucune page', async () => {
        const id = await startImport();
        vi.mocked(countPages).mockResolvedValueOnce(0);
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).status).toBe(400);
        expect((await rowOf(id)).status).toBe('failed');
    });

    it('500 et import `failed` si l\'extraction échoue', async () => {
        const id = await startImport();
        vi.mocked(extractPages).mockRejectedValueOnce(new Error('boom'));
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).status).toBe(500);
        expect((await rowOf(id)).status).toBe('failed');
    });

    it('un lot court (arrêt sur délai) avance de ce qui a été lu, puis la reprise est acceptée', async () => {
        extraction.pageCount = 200;
        const id = await startImport();
        vi.mocked(extractPages).mockImplementationOnce(async () =>
            Array.from({ length: 30 }, (_, i) => ({ page: i + 1, title: '', body: `page ${i + 1}` })));

        const first = await (await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).json();
        expect(first).toMatchObject({ processedPages: 30, done: false });

        const next = await processRoute(post('/api/referentiel/process', { id, fromPage: 31 }));
        expect(next.status).toBe(200);
        expect(vi.mocked(extractPages).mock.calls.at(-1)!.slice(1, 3)).toEqual([31, 110]);
    });

    it('classe une page dont le titre contient le terme avant une page où il n\'est que dans le corps', async () => {
        extraction.pageCount = 2;
        vi.mocked(extractPages).mockImplementationOnce(async () => [
            { page: 1, title: '', body: 'Il faut rafraîchir la brûlure sous l\'eau pendant dix minutes.' },
            { page: 2, title: 'Brûlure thermique — Affections · IV.D.1', body: 'Il faut rafraîchir sous l\'eau pendant dix minutes.' },
        ]);
        await importReferentiel();
        asSession(VOLUNTEER);
        const body = await (await search(get('/api/referentiel/search?q=brulure'))).json();
        expect(body.results.map((r: { page: number }) => r.page)).toEqual([2, 1]);
    });

    it('à la bascule, une page de suite reprend le nom de fiche de sa couverture', async () => {
        extraction.pageCount = 2;
        vi.mocked(extractPages).mockImplementationOnce(async () => [
            { page: 1, title: 'Hémorragie externe — Urgences vitales · IV.B.2', body: 'Définition.' },
            { page: 2, title: 'Conduite à tenir / Urgences vitales / IV.B.2', body: 'Comprimer la plaie, saignement abondant.' },
        ]);
        const id = await importReferentiel();

        const row = (await db.execute({ sql: `SELECT title FROM ReferentielPage WHERE referentielId = ? AND page = 2`, args: [id] })).rows[0];
        expect(row.title).toBe('Hémorragie externe — Urgences vitales · IV.B.2');

        asSession(VOLUNTEER);
        const body = await (await search(get('/api/referentiel/search?q=saignement'))).json();
        expect(body.results[0]).toMatchObject({ page: 2, title: 'Hémorragie externe — Urgences vitales · IV.B.2' });
    });

    it('renomme au-delà du premier paquet de titres lus (plus de 200 pages, plus de 100 renommages)', async () => {
        extraction.pageCount = 450;
        const defaultExtract = vi.mocked(extractPages).getMockImplementation()!;
        vi.mocked(extractPages).mockImplementation(async (_source: unknown, from: number, to: number) =>
            Array.from({ length: Math.min(to, 450) - from + 1 }, (_, i) => {
                const page = from + i;
                return {
                    page,
                    title: page === 1 ? 'Brûlures — Affections traumatiques · IV.D.2' : 'Conduite à tenir / Affections traumatiques / IV.D.2',
                    body: `Contenu ${page}.`,
                };
            }));
        let id: string;
        try {
            id = await importReferentiel();
        } finally {
            vi.mocked(extractPages).mockImplementation(defaultExtract);
        }

        const rows = (await db.execute({
            sql: `SELECT COUNT(*) AS n FROM ReferentielPage WHERE referentielId = ? AND title = 'Brûlures — Affections traumatiques · IV.D.2'`,
            args: [id],
        })).rows;
        expect(rows[0].n).toBe(450);
    });

    it('purge à la bascule un import resté `uploading` (dépôt jamais fait) et son objet R2', async () => {
        asSession(SUPER_ADMIN);
        const abandoned = (await (await upload(post('/api/referentiel/upload', { fileName: 'abandon.pdf' }))).json()).id;
        const abandonedKey = (await db.execute({ sql: `SELECT r2Key FROM Referentiel WHERE id = ?`, args: [abandoned] })).rows[0].r2Key;

        await importReferentiel();

        expect(await rowOf(abandoned)).toBeUndefined();
        expect(deleteObject).toHaveBeenCalledWith(String(abandonedKey));
        asSession(SUPER_ADMIN);
        expect((await (await getStatus()).json()).pending).toBeNull();
    });

    it('409 si l\'import est abandonné pendant son dernier lot : il ne s\'active pas', async () => {
        const id = await startImport();
        vi.mocked(extractPages).mockImplementationOnce(async (_source: unknown, from: number, to: number) => {
            await db.execute({ sql: `UPDATE Referentiel SET status = 'failed' WHERE id = ?`, args: [id] });
            return Array.from({ length: to - from + 1 }, (_, i) => ({ page: from + i, title: '', body: 'x' }));
        });
        expect((await processRoute(post('/api/referentiel/process', { id, fromPage: 1 }))).status).toBe(200);
        const res = await processRoute(post('/api/referentiel/process', { id, fromPage: 4 }));
        expect(res.status).toBe(409);
        expect((await rowOf(id)).status).toBe('failed');
        asSession(VOLUNTEER);
        expect((await (await getStatus()).json()).ready).toBe(false);
    });
});

describe('GET /api/referentiel', () => {
    it('401 sans session, 403 pour un compte INACTIF', async () => {
        asSession(null);
        expect((await getStatus()).status).toBe(401);
        asSession(INACTIVE);
        expect((await getStatus()).status).toBe(403);
    });

    it('renvoie { ready: false } sans référentiel', async () => {
        asSession(VOLUNTEER);
        const res = await getStatus();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ready: false });
    });

    it('renvoie les métadonnées du référentiel actif, sans la clé R2', async () => {
        await importReferentiel();
        asSession(VOLUNTEER);
        const body = await (await getStatus()).json();
        expect(body).toMatchObject({ ready: true, fileName: 'guide.pdf', pageCount: 3 });
        expect(JSON.stringify(body)).not.toContain('referentiels/');
        expect(body.pending).toBeUndefined();
    });

    it('ajoute l\'import en cours pour le SUPER_ADMIN uniquement', async () => {
        asSession(SUPER_ADMIN);
        await upload(post('/api/referentiel/upload', { fileName: 'encours.pdf' }));
        const asSuper = await (await getStatus()).json();
        expect(asSuper.pending).toMatchObject({ fileName: 'encours.pdf', status: 'uploading' });

        asSession(ADMIN);
        expect((await (await getStatus()).json()).pending).toBeUndefined();
    });
});

describe('GET /api/referentiel/search', () => {
    it('401 sans session, 403 pour un compte INACTIF', async () => {
        asSession(null);
        expect((await search(get('/api/referentiel/search?q=hemorragie'))).status).toBe(401);
        asSession(INACTIVE);
        expect((await search(get('/api/referentiel/search?q=hemorragie'))).status).toBe(403);
    });

    it('400 si la question est absente, trop courte ou trop longue', async () => {
        asSession(VOLUNTEER);
        expect((await search(get('/api/referentiel/search'))).status).toBe(400);
        expect((await search(get('/api/referentiel/search?q=a'))).status).toBe(400);
        expect((await search(get(`/api/referentiel/search?q=${'a'.repeat(201)}`))).status).toBe(400);
    });

    it('200 { ready: false } sans référentiel', async () => {
        asSession(VOLUNTEER);
        const res = await search(get('/api/referentiel/search?q=hemorragie'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ready: false, results: [] });
    });

    it('trouve la page par une question naturelle, avec titre, extrait surligné et numéro', async () => {
        await importReferentiel();
        asSession(VOLUNTEER);
        const body = await (await search(get('/api/referentiel/search?q=' + encodeURIComponent('que faire devant une hémorragie')))).json();
        expect(body.ready).toBe(true);
        expect(body.results[0]).toMatchObject({ page: 2, title: 'Urgences vitales / Hémorragie / IV.B.1' });
        expect(body.results[0].excerpt).toMatch(/\u0002h[ée]morragie\u0003/i);
    });

    it('trouve sans accents', async () => {
        await importReferentiel();
        asSession(VOLUNTEER);
        const body = await (await search(get('/api/referentiel/search?q=hemorragie'))).json();
        expect(body.results.map((r: { page: number }) => r.page)).toEqual([2]);
    });

    it('renvoie une liste vide, sans erreur, pour des mots vides ou des caractères FTS', async () => {
        await importReferentiel();
        asSession(VOLUNTEER);
        for (const q of ['que faire ?', '"*(OR', 'NEAR( AND "']) {
            const res = await search(get(`/api/referentiel/search?q=${encodeURIComponent(q)}`));
            expect(res.status).toBe(200);
            expect((await res.json()).results).toEqual([]);
        }
    });

    it('limite à 5 résultats', async () => {
        extraction.pageCount = 12;
        await importReferentiel();
        asSession(VOLUNTEER);
        const body = await (await search(get('/api/referentiel/search?q=contenu'))).json();
        expect(body.results).toHaveLength(5);
    });
});

describe('GET /api/referentiel/file-url', () => {
    it('401 sans session, 403 pour un compte INACTIF', async () => {
        asSession(null);
        expect((await fileUrl()).status).toBe(401);
        asSession(INACTIVE);
        expect((await fileUrl()).status).toBe(403);
    });

    it('404 sans référentiel', async () => {
        asSession(VOLUNTEER);
        expect((await fileUrl()).status).toBe(404);
    });

    it('renvoie une URL GET signée (1 h) du PDF actif', async () => {
        await importReferentiel();
        vi.mocked(presignUrl).mockClear();
        vi.mocked(getObjectRange).mockClear();
        asSession(VOLUNTEER);
        const res = await fileUrl();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ fileName: 'guide.pdf', pageCount: 3 });
        expect(body.url).toContain('m=GET');
        expect(presignUrl).toHaveBeenCalledWith('referentiels/key-att1.pdf', 'GET', 3600);
        // Le PDF n'est jamais lu côté serveur : l'URL signée suffit.
        expect(getObjectRange).not.toHaveBeenCalled();
    });
});
