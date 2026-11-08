// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { relocateReport, relocatedRevisionKey, type RelocationDeps } from '@/lib/expenses/r2-relocation';

function makeDeps(initial: Record<string, string>, rowsAffected = 1) {
    const store = new Map<string, Buffer>(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]));
    const deps: RelocationDeps = {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, b: Buffer) => { store.set(k, b); }),
        head: vi.fn(async (k: string) => store.has(k)),
        delete: vi.fn(async (k: string) => { store.delete(k); }),
        execute: vi.fn(async () => ({ rowsAffected })),
    };
    return { store, deps };
}

const journal = (...keys: string[]) => JSON.stringify(keys.map((r2Key, i) => ({ step: i + 1, r2Key })));

describe('relocatedRevisionKey', () => {
    it('joint les segments d\'une ancienne clé par "-"', () => {
        expect(relocatedRevisionKey('rep-1/v1-abc.pdf', 'paris-18')).toBe('ndf-revisions/paris-18/rep-1-v1-abc.pdf');
    });
    it('garde le dernier segment d\'une clé déjà sous ndf-revisions/', () => {
        expect(relocatedRevisionKey('ndf-revisions/ancien/rep-1-v1-abc.pdf', 'nouveau'))
            .toBe('ndf-revisions/nouveau/rep-1-v1-abc.pdf');
        expect(relocatedRevisionKey('ndf-revisions/paris-18/rep-1-v1-abc.pdf', 'paris-18'))
            .toBe('ndf-revisions/paris-18/rep-1-v1-abc.pdf');
    });
});

describe('relocateReport', () => {
    const apply = { apply: true, deleteOld: false };

    it('ignore un brouillon (r2Key NULL)', async () => {
        const { deps } = makeDeps({});
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: null, signatureRevisions: null }, deps, apply);
        expect(res.status).toBe('skipped');
        expect(deps.put).not.toHaveBeenCalled();
    });

    it('migre une ancienne clé : révisions copiées, base repointée, copie publiée créée, anciennes conservées', async () => {
        const { store, deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one', 'rep-1/v2-bbb.pdf': 'two' });
        const raw = journal('rep-1/v1-aaa.pdf', 'rep-1/v2-bbb.pdf');
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v2-bbb.pdf', signatureRevisions: raw }, deps, apply);

        expect(res.status).toBe('moved');
        expect(store.get('ndf-revisions/paris-18/rep-1-v1-aaa.pdf')?.toString()).toBe('one');
        expect(store.get('ndf-revisions/paris-18/rep-1-v2-bbb.pdf')?.toString()).toBe('two');
        expect(store.get('ndf/paris-18/rep-1.pdf')?.toString()).toBe('two');
        expect(store.has('rep-1/v1-aaa.pdf')).toBe(true);
        expect(deps.delete).not.toHaveBeenCalled();

        const call = vi.mocked(deps.execute).mock.calls[0][0];
        expect(call.sql).toContain('WHERE id = ? AND r2Key IS ? AND signatureRevisions IS ?');
        expect(call.args[0]).toBe('ndf-revisions/paris-18/rep-1-v2-bbb.pdf');
        expect(JSON.parse(call.args[1] as string).map((r: { r2Key: string }) => r.r2Key)).toEqual([
            'ndf-revisions/paris-18/rep-1-v1-aaa.pdf', 'ndf-revisions/paris-18/rep-1-v2-bbb.pdf',
        ]);
        expect(call.args.slice(2)).toEqual(['rep-1', 'rep-1/v2-bbb.pdf', raw]);
    });

    it('déjà rangée : aucune copie de révision, aucun UPDATE, copie publiée réécrite', async () => {
        const k = 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf';
        const { store, deps } = makeDeps({ [k]: 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: k, signatureRevisions: journal(k) }, deps, apply);

        expect(res.status).toBe('unchanged');
        expect(deps.execute).not.toHaveBeenCalled();
        expect(vi.mocked(deps.put).mock.calls.map(c => c[0])).toEqual(['ndf/paris-18/rep-1.pdf']);
        expect(store.get('ndf/paris-18/rep-1.pdf')?.toString()).toBe('one');
    });

    it('slug renommé : révisions déplacées, anciennes et ancienne copie publiée supprimées avec --delete-old', async () => {
        const old = 'ndf-revisions/ancien/rep-1-v1-aaa.pdf';
        const { store, deps } = makeDeps({ [old]: 'one', 'ndf/ancien/rep-1.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'nouveau', r2Key: old, signatureRevisions: journal(old) },
            deps, { apply: true, deleteOld: true });

        expect(res.status).toBe('moved');
        expect(store.has('ndf-revisions/nouveau/rep-1-v1-aaa.pdf')).toBe(true);
        expect(store.has('ndf/nouveau/rep-1.pdf')).toBe(true);
        expect(store.has(old)).toBe(false);
        expect(store.has('ndf/ancien/rep-1.pdf')).toBe(false);
    });

    it('ne recopie pas une cible déjà présente (reprise après interruption)', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one', 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: journal('rep-1/v1-aaa.pdf') }, deps, apply);
        expect(res.status).toBe('moved');
        expect(res.moves[0].copied).toBe(false);
        expect(vi.mocked(deps.put).mock.calls.map(c => c[0])).toEqual(['ndf/paris-18/rep-1.pdf']);
    });

    it('source manquante : note sautée, base intacte, erreur', async () => {
        const { deps } = makeDeps({});
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: journal('rep-1/v1-aaa.pdf') }, deps, apply);
        expect(res.status).toBe('error');
        expect(res.reason).toContain('rep-1/v1-aaa.pdf');
        expect(deps.execute).not.toHaveBeenCalled();
        expect(deps.put).not.toHaveBeenCalled();
    });

    it('concurrence : UPDATE à 0 ligne ⇒ note sautée, pas de copie publiée ni de suppression', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' }, 0);
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: journal('rep-1/v1-aaa.pdf') },
            deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('skipped');
        expect(deps.delete).not.toHaveBeenCalled();
        expect(vi.mocked(deps.put).mock.calls.map(c => c[0])).not.toContain('ndf/paris-18/rep-1.pdf');
    });

    it('dry-run : rien n\'est écrit, le plan est rempli', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: journal('rep-1/v1-aaa.pdf') },
            deps, { apply: false, deleteOld: false });
        expect(res.status).toBe('moved');
        expect(res.moves).toEqual([{ from: 'rep-1/v1-aaa.pdf', to: 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf', copied: true }]);
        expect(res.publishedKey).toBe('ndf/paris-18/rep-1.pdf');
        expect(deps.put).not.toHaveBeenCalled();
        expect(deps.execute).not.toHaveBeenCalled();
        expect(deps.delete).not.toHaveBeenCalled();
    });

    it('journal illisible : erreur sans toucher à R2 ni à la base', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: '{pas du json' }, deps, apply);
        expect(res.status).toBe('error');
        expect(deps.put).not.toHaveBeenCalled();
    });

    it('journal NULL avec déplacement : l\'UPDATE écrit un journal NULL', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: null }, deps, apply);
        expect(res.status).toBe('moved');
        const call = vi.mocked(deps.execute).mock.calls[0][0];
        expect(call.args).toEqual(['ndf-revisions/paris-18/rep-1-v1-aaa.pdf', null, 'rep-1', 'rep-1/v1-aaa.pdf', null]);
    });

    it('journal vide \'\' : la valeur brute sert de garde et le journal est réécrit', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: '' }, deps, apply);
        expect(res.status).toBe('moved');
        const call = vi.mocked(deps.execute).mock.calls[0][0];
        expect(call.args[4]).toBe('');
        expect(call.args[1]).toBe('[]');
    });

    it('r2Key absent du journal : il est tout de même rangé et repointé', async () => {
        const { store, deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one', 'rep-1/v2-bbb.pdf': 'two' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v2-bbb.pdf', signatureRevisions: journal('rep-1/v1-aaa.pdf') }, deps, apply);
        expect(res.status).toBe('moved');
        expect(store.has('ndf-revisions/paris-18/rep-1-v2-bbb.pdf')).toBe(true);
        expect(vi.mocked(deps.execute).mock.calls[0][0].args[0]).toBe('ndf-revisions/paris-18/rep-1-v2-bbb.pdf');
    });

    it('entrées nulles ou non objets dans le journal : ignorées et conservées telles quelles', async () => {
        const { deps } = makeDeps({ 'rep-1/v1-aaa.pdf': 'one' });
        const raw = JSON.stringify([null, 'x', 3, { step: 1, r2Key: 'rep-1/v1-aaa.pdf' }]);
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: 'rep-1/v1-aaa.pdf', signatureRevisions: raw }, deps, apply);
        expect(res.status).toBe('moved');
        expect(JSON.parse(vi.mocked(deps.execute).mock.calls[0][0].args[1] as string)).toEqual([
            null, 'x', 3, { step: 1, r2Key: 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf' },
        ]);
    });

    it('--delete-old lors d\'un passage ultérieur : supprime la clé héritée encore présente', async () => {
        const k = 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf';
        const { store, deps } = makeDeps({ [k]: 'one', 'rep-1/v1-aaa.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: k, signatureRevisions: journal(k) },
            deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('unchanged');
        expect(deps.execute).not.toHaveBeenCalled();
        expect(res.deleted).toEqual(['rep-1/v1-aaa.pdf']);
        expect(store.has('rep-1/v1-aaa.pdf')).toBe(false);
        expect(store.has(k)).toBe(true);
    });

    it('--delete-old ne supprime rien si la clé héritée est déjà partie', async () => {
        const k = 'ndf-revisions/paris-18/rep-1-v1-aaa.pdf';
        const { deps } = makeDeps({ [k]: 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'paris-18', r2Key: k, signatureRevisions: journal(k) },
            deps, { apply: true, deleteOld: true });
        expect(res.deleted).toEqual([]);
        expect(deps.delete).not.toHaveBeenCalled();
    });

    it('dry-run avec --delete-old : liste anciennes clés et copie publiée périmée, sans rien supprimer', async () => {
        const old = 'ndf-revisions/ancien/rep-1-v1-aaa.pdf';
        const { deps } = makeDeps({ [old]: 'one', 'ndf/ancien/rep-1.pdf': 'one' });
        const res = await relocateReport({ id: 'rep-1', segment: 'nouveau', r2Key: old, signatureRevisions: journal(old) },
            deps, { apply: false, deleteOld: true });
        expect(res.deleted.sort()).toEqual([old, 'ndf/ancien/rep-1.pdf'].sort());
        expect(deps.delete).not.toHaveBeenCalled();
        expect(deps.put).not.toHaveBeenCalled();
    });
});
