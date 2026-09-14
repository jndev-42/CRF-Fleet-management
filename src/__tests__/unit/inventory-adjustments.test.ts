/**
 * Tests unitaires — `src/lib/inventory/adjustments.ts`.
 *
 * Le planificateur est SANS E/S : toute la matrice FEFO est testable ici, sans
 * base. C'est l'intérêt principal de l'extraction, et le filet le plus fin sur
 * une règle qui n'en avait aucun.
 *
 * Couvre AC-U6 → AC-U9.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { InStatement, ResultSet } from '@libsql/client';
import {
    loadItemBatchStates,
    planStockMovement,
    runStatements,
    FEFO_ORDER_BY,
    RESYNC_ITEM_QUANTITY_SQL,
    type ItemBatchState,
    type SqlExecutor,
} from '@/lib/inventory/adjustments';

type Batch = { id: string; quantity: number; expiryDate: string | null };

function statesOf(itemId: string, batches: Batch[]): Map<string, ItemBatchState> {
    return new Map([[itemId, { itemId, batches }]]);
}

/** Raccourci : le SQL d'une instruction, quelle que soit sa forme. */
function sqlOf(stmt: InStatement): string {
    return typeof stmt === 'string' ? stmt : stmt.sql;
}

function argsOf(stmt: InStatement): unknown[] {
    return typeof stmt === 'string' ? [] : (stmt.args as unknown[]);
}

/**
 * Table VISÉE par une instruction. La resynchronisation cite `"InvBatch"` dans
 * sa sous-requête tout en écrivant `"InvItem"` : c'est la cible qui compte, pas
 * la simple présence du nom.
 */
function targetOf(stmt: InStatement): 'lot' | 'resync' | 'log' | 'autre' {
    const sql = sqlOf(stmt);
    if (/^\s*UPDATE\s+"InvItem"/.test(sql)) return 'resync';
    if (/"InvStockLog"/.test(sql)) return 'log';
    if (/"InvBatch"/.test(sql)) return 'lot';
    return 'autre';
}

/** Ne retient que les écritures de lot — resynchronisation et journal exclus. */
function batchWrites(stmts: InStatement[]): InStatement[] {
    return stmts.filter(s => targetOf(s) === 'lot');
}

function expectOk(result: ReturnType<typeof planStockMovement>) {
    if ('error' in result) {
        throw new Error(`Planification refusée : ${result.error}`);
    }
    return result;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('planStockMovement', () => {
    describe('ajout', () => {
        it('alimente le lot existant portant la même date', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 3, expiryDate: '2030-01-01' }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 5, expiryDate: '2030-01-01' }, 'Alex'));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(1);
            expect(sqlOf(writes[0])).toContain('quantity = quantity + ?');
            expect(argsOf(writes[0])).toEqual([5, 'b-1']);
            expect(plan.newQuantity).toBe(8);
        });

        it('crée un lot pour une date inédite', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 3, expiryDate: '2030-01-01' }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 5, expiryDate: '2031-06-01' }, 'Alex'));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(1);
            expect(sqlOf(writes[0])).toContain('INSERT INTO "InvBatch"');
            expect(argsOf(writes[0])[3]).toBe('2031-06-01');
            expect(plan.newQuantity).toBe(8);
        });

        it('traite `expiryDate` absent comme le lot sans date', () => {
            const states = statesOf('item-1', [{ id: 'b-nd', quantity: 2, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 4 }, 'Alex'));

            expect(argsOf(batchWrites(plan.statements)[0])).toEqual([4, 'b-nd']);
            expect(plan.newQuantity).toBe(6);
        });

        it('traite une chaîne vide comme « sans date », comme la route d\'origine', () => {
            const states = statesOf('item-1', [{ id: 'b-nd', quantity: 2, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 4, expiryDate: '' }, 'Alex'));

            expect(argsOf(batchWrites(plan.statements)[0])).toEqual([4, 'b-nd']);
        });

        // AC-U9
        it('réalimente un lot existant à quantité NULLE au lieu d\'en créer un doublon', () => {
            const states = statesOf('item-1', [{ id: 'b-vide', quantity: 0, expiryDate: '2030-01-01' }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 5, expiryDate: '2030-01-01' }, 'Alex'));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(1);
            expect(sqlOf(writes[0])).toContain('quantity = quantity + ?');
            expect(sqlOf(writes[0])).not.toContain('INSERT');
            expect(argsOf(writes[0])).toEqual([5, 'b-vide']);
            expect(plan.newQuantity).toBe(5);
        });
    });

    describe('retrait FEFO', () => {
        it('vide les lots par date croissante, sans date en dernier', () => {
            const states = statesOf('item-1', [
                { id: 'b-perime', quantity: 2, expiryDate: '2025-01-01' },
                { id: 'b-proche', quantity: 3, expiryDate: '2026-01-01' },
                { id: 'b-nodate', quantity: 4, expiryDate: null },
            ]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: -7 }, 'Alex'));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(3);
            expect(argsOf(writes[0])).toEqual(['b-perime']);
            expect(argsOf(writes[1])).toEqual(['b-proche']);
            expect(sqlOf(writes[2])).toContain('quantity = quantity - ?');
            expect(argsOf(writes[2])).toEqual([2, 'b-nodate']);
            expect(plan.newQuantity).toBe(2);
        });

        it('ignore les lots déjà vides', () => {
            const states = statesOf('item-1', [
                { id: 'b-vide', quantity: 0, expiryDate: '2025-01-01' },
                { id: 'b-plein', quantity: 5, expiryDate: '2026-01-01' },
            ]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: -2 }, 'Alex'));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(1);
            expect(argsOf(writes[0])).toEqual([2, 'b-plein']);
        });

        it('plafonne à 0 sur un retrait excessif et journalise la valeur DEMANDÉE', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 2, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: -5 }, 'Alex'));

            expect(plan.newQuantity).toBe(0);
            const log = plan.statements[plan.statements.length - 1];
            expect(sqlOf(log)).toContain('INSERT INTO "InvStockLog"');
            expect(argsOf(log)[2]).toBe(-5);
        });

        it('n\'émet aucune écriture de lot quand l\'article est déjà vide', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 0, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: -3 }, 'Alex'));

            expect(batchWrites(plan.statements)).toHaveLength(0);
            // La resynchronisation et le journal partent quand même : le mouvement
            // a été demandé, il doit laisser une trace.
            expect(plan.statements).toHaveLength(2);
        });
    });

    describe('deductFromNoDate', () => {
        it('déplace du stock sans date vers un lot daté, à total constant', () => {
            const states = statesOf('item-1', [{ id: 'b-nd', quantity: 10, expiryDate: null }]);

            const plan = expectOk(planStockMovement(
                states,
                { itemId: 'item-1', change: 4, expiryDate: '2030-03-01', deductFromNoDate: true },
                'Alex',
            ));

            const writes = batchWrites(plan.statements);
            expect(writes).toHaveLength(2);
            expect(sqlOf(writes[0])).toContain('quantity = quantity - ?');
            expect(argsOf(writes[0])).toEqual([4, 'b-nd']);
            expect(sqlOf(writes[1])).toContain('INSERT INTO "InvBatch"');
            expect(plan.newQuantity).toBe(10);
        });

        it('refuse quand le lot sans date est insuffisant', () => {
            const states = statesOf('item-1', [{ id: 'b-nd', quantity: 2, expiryDate: null }]);

            const result = planStockMovement(
                states,
                { itemId: 'item-1', change: 5, expiryDate: '2030-03-01', deductFromNoDate: true },
                'Alex',
            );

            expect(result).toEqual({ error: 'NO_DATE_INSUFFICIENT' });
        });

        it('refuse quand aucun lot sans date n\'existe', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 50, expiryDate: '2029-01-01' }]);

            const result = planStockMovement(
                states,
                { itemId: 'item-1', change: 5, expiryDate: '2030-03-01', deductFromNoDate: true },
                'Alex',
            );

            expect(result).toEqual({ error: 'NO_DATE_INSUFFICIENT' });
        });

        it('est ignoré quand aucune date cible n\'est fournie', () => {
            const states = statesOf('item-1', [{ id: 'b-nd', quantity: 10, expiryDate: null }]);

            const plan = expectOk(planStockMovement(
                states,
                { itemId: 'item-1', change: 4, deductFromNoDate: true },
                'Alex',
            ));

            // Un simple ajout sur le lot sans date : pas de découpage.
            expect(batchWrites(plan.statements)).toHaveLength(1);
            expect(plan.newQuantity).toBe(14);
        });
    });

    describe('séquence de mouvements sur le même article', () => {
        it('part de l\'état laissé par le mouvement précédent', () => {
            const states = statesOf('item-1', [{ id: 'b-a', quantity: 0, expiryDate: '2030-01-01' }]);

            const p1 = expectOk(planStockMovement(states, { itemId: 'item-1', change: 5, expiryDate: '2030-01-01' }, 'Alex'));
            const p2 = expectOk(planStockMovement(states, { itemId: 'item-1', change: -3 }, 'Alex'));
            const p3 = expectOk(planStockMovement(states, { itemId: 'item-1', change: 2, expiryDate: '2031-01-01' }, 'Alex'));

            expect(p1.newQuantity).toBe(5);
            expect(p2.newQuantity).toBe(2);
            expect(p3.newQuantity).toBe(4);
        });

        it('applique le FEFO à un lot créé plus tôt dans le même panier', () => {
            // Le lot 2029 est créé APRÈS le lot 2031 : il arrive en fin de liste,
            // mais il périme plus tôt et doit donc être servi en premier.
            const states = statesOf('item-1', [{ id: 'b-2031', quantity: 4, expiryDate: '2031-01-01' }]);

            planStockMovement(states, { itemId: 'item-1', change: 3, expiryDate: '2029-01-01' }, 'Alex');
            const retrait = expectOk(planStockMovement(states, { itemId: 'item-1', change: -3 }, 'Alex'));

            const writes = batchWrites(retrait.statements);
            expect(writes).toHaveLength(1);
            expect(sqlOf(writes[0])).toContain('quantity = 0');
            expect(retrait.newQuantity).toBe(4);
        });
    });

    describe('contrat d\'émission', () => {
        // AC-U6
        it('refuse un article absent de la Map (ITEM_NOT_FOUND)', () => {
            const result = planStockMovement(new Map(), { itemId: 'inconnu', change: 1 }, 'Alex');
            expect(result).toEqual({ error: 'ITEM_NOT_FOUND' });
        });

        // AC-U7
        it('ordonne : écritures de lot, puis resynchronisation, puis journal', () => {
            const states = statesOf('item-1', [
                { id: 'b-1', quantity: 2, expiryDate: '2025-01-01' },
                { id: 'b-2', quantity: 3, expiryDate: '2026-01-01' },
            ]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: -4 }, 'Alex'));

            const kinds = plan.statements.map(targetOf);
            expect(kinds).toEqual(['lot', 'lot', 'resync', 'log']);
        });

        it('resynchronise par la constante partagée, avec [itemId, itemId]', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 2, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 1 }, 'Alex'));

            const resync = plan.statements.find(s => sqlOf(s) === RESYNC_ITEM_QUANTITY_SQL);
            expect(resync).toBeDefined();
            expect(argsOf(resync!)).toEqual(['item-1', 'item-1']);
        });

        // AC-U8
        it('n\'écrit JAMAIS `InvItem.quantity` depuis un total calculé en mémoire', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 2, expiryDate: null }]);

            const plans = [
                planStockMovement(states, { itemId: 'item-1', change: 5, expiryDate: '2030-01-01' }, 'Alex'),
                planStockMovement(states, { itemId: 'item-1', change: -3 }, 'Alex'),
            ];

            for (const plan of plans) {
                for (const stmt of expectOk(plan).statements) {
                    expect(sqlOf(stmt)).not.toMatch(/UPDATE\s+"InvItem"\s+SET\s+quantity\s*=\s*\?/);
                }
            }
        });

        it('journalise l\'auteur et convertit une note vide en NULL', () => {
            const states = statesOf('item-1', [{ id: 'b-1', quantity: 2, expiryDate: null }]);

            const plan = expectOk(planStockMovement(states, { itemId: 'item-1', change: 1, note: '' }, 'Alex Admin'));

            const log = plan.statements[plan.statements.length - 1];
            expect(argsOf(log)[3]).toBe('Alex Admin');
            expect(argsOf(log)[4]).toBeNull();
        });
    });
});

describe('loadItemBatchStates', () => {
    function fakeExecutor(rows: Record<string, unknown>[]): SqlExecutor & { calls: InStatement[] } {
        const calls: InStatement[] = [];
        return {
            calls,
            async execute(stmt: InStatement) {
                calls.push(stmt);
                return { rows } as unknown as ResultSet;
            },
            async batch() {
                return [];
            },
        };
    }

    it('pré-remplit la Map : un article sans lot existe et rend `batches: []`', async () => {
        const exec = fakeExecutor([]);
        const states = await loadItemBatchStates(exec, ['item-1', 'item-2']);

        expect([...states.keys()]).toEqual(['item-1', 'item-2']);
        expect(states.get('item-1')!.batches).toEqual([]);
    });

    it('charge TOUS les lots, y compris ceux à quantité nulle', async () => {
        const exec = fakeExecutor([]);
        await loadItemBatchStates(exec, ['item-1']);

        const sql = sqlOf(exec.calls[0]);
        expect(sql).toContain(FEFO_ORDER_BY);
        expect(sql).not.toContain('quantity > 0');
    });

    it('dédoublonne les identifiants demandés', async () => {
        const exec = fakeExecutor([]);
        await loadItemBatchStates(exec, ['item-1', 'item-1', 'item-2']);

        expect(exec.calls).toHaveLength(1);
        expect(argsOf(exec.calls[0])).toEqual(['item-1', 'item-2']);
    });

    it('regroupe les lots par article', async () => {
        const exec = fakeExecutor([
            { id: 'b-1', itemId: 'item-1', quantity: 2, expiryDate: '2030-01-01' },
            { id: 'b-2', itemId: 'item-1', quantity: 3, expiryDate: null },
            { id: 'b-3', itemId: 'item-2', quantity: 1, expiryDate: null },
        ]);

        const states = await loadItemBatchStates(exec, ['item-1', 'item-2']);

        expect(states.get('item-1')!.batches).toHaveLength(2);
        expect(states.get('item-2')!.batches).toEqual([{ id: 'b-3', quantity: 1, expiryDate: null }]);
    });
});

describe('runStatements', () => {
    it('envoie les instructions par paquets, dans l\'ordre', async () => {
        const sent: InStatement[][] = [];
        const exec: SqlExecutor = {
            async execute() { return {} as unknown as ResultSet; },
            async batch(stmts) { sent.push(stmts); return []; },
        };

        const statements: InStatement[] = Array.from({ length: 3 }, (_, i) => ({
            sql: `UPDATE "InvBatch" SET quantity = ? WHERE id = ?`,
            args: [i, `b-${i}`],
        }));

        await runStatements(exec, statements);

        expect(sent).toHaveLength(1);
        expect(sent[0]).toEqual(statements);
    });

    it('n\'appelle pas `batch` quand il n\'y a rien à écrire', async () => {
        const batch = vi.fn(async () => []);
        await runStatements({ async execute() { return {} as unknown as ResultSet; }, batch }, []);
        expect(batch).not.toHaveBeenCalled();
    });
});
