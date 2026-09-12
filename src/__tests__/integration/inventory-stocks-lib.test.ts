/**
 * Tests d'intégration — src/lib/inventory/stocks.ts (getOrCreateDefaultStock).
 * DB réelle (pas de mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import {
    ensureStockTableExists,
    getOrCreateDefaultStock,
    getOrCreateStockQrToken,
    regenerateStockQrToken,
    resolveStockByQrToken,
} from '@/lib/inventory/stocks';
import { db, seedInvItem } from './setup';

describe('getOrCreateDefaultStock', () => {
    it('crée un stock par défaut si aucun n\'existe pour l\'UL', async () => {
        const stock = await getOrCreateDefaultStock('ul-paris-18');
        expect(stock.name).toBe('Stock Principal');
        expect(stock.ulId).toBe('ul-paris-18');
        expect(Number(stock.isDefault)).toBe(1);
    });

    it('retourne le stock existant plutôt que d\'en créer un nouveau', async () => {
        const first = await getOrCreateDefaultStock('ul-paris-18');
        const second = await getOrCreateDefaultStock('ul-paris-18');
        expect(second.id).toBe(first.id);

        const all = await db.execute({ sql: `SELECT id FROM "InvStockList" WHERE ulId = ?`, args: ['ul-paris-18'] });
        expect(all.rows).toHaveLength(1);
    });

    it('rattache les articles orphelins (sans stockId) au stock par défaut', async () => {
        await seedInvItem({ id: 'orphan-item', ulId: 'ul-paris-18', stockId: null });

        const stock = await getOrCreateDefaultStock('ul-paris-18');

        const item = await db.execute({ sql: `SELECT stockId FROM "InvItem" WHERE id = ?`, args: ['orphan-item'] });
        expect(item.rows[0].stockId).toBe(stock.id);
    });

    it('isole les stocks par défaut par UL', async () => {
        const stockA = await getOrCreateDefaultStock('ul-paris-18');
        const stockB = await getOrCreateDefaultStock('ul-lyon-3');
        expect(stockA.id).not.toBe(stockB.id);
    });
});

// ── Schéma : colonne qrToken et son index unique partiel ──────────────────────

/**
 * Remet `InvStockList` dans sa forme AVANT migration (sans `qrToken`, sans
 * index). Sans ce démontage explicite, les scénarios ci-dessous passeraient sur
 * une table déjà à jour et ne prouveraient rien du chemin qu'ils prétendent
 * couvrir. Le `beforeEach` de `setup.ts` recrée la table pour les tests suivants.
 */
async function recreateLegacyStockTable() {
    await db.execute(`DROP TABLE IF EXISTS "InvStockList"`);
    await db.execute(`CREATE TABLE "InvStockList" (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        ulId TEXT NOT NULL DEFAULT 'default',
        isDefault INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}

async function stockListColumns(): Promise<string[]> {
    const res = await db.execute(`PRAGMA table_info("InvStockList")`);
    return res.rows.map(r => String(r.name));
}

async function stockListIndexes(): Promise<string[]> {
    const res = await db.execute(`PRAGMA index_list("InvStockList")`);
    return res.rows.map(r => String(r.name));
}

async function insertStock(id: string, qrToken: string | null) {
    await db.execute({
        sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault, qrToken) VALUES (?, ?, 'ul-paris-18', 0, ?)`,
        args: [id, `Stock ${id}`, qrToken],
    });
}

/**
 * `truncateTables()` de `setup.ts` ne vide pas `InvStockList` : les lignes
 * survivent d'un test à l'autre. Les suites ci-dessous réutilisent des
 * identifiants fixes, elles nettoient donc elles-mêmes.
 */
beforeEach(async () => {
    await db.execute(`DELETE FROM "InvStockList"`);
});

describe('ensureStockTableExists — colonne qrToken', () => {
    it('ajoute la colonne sur une base migrée (AC-S1)', async () => {
        await recreateLegacyStockTable();
        expect(await stockListColumns()).not.toContain('qrToken');

        await ensureStockTableExists();

        expect(await stockListColumns()).toContain('qrToken');
    });

    it('est idempotente : deux appels successifs ne lèvent ni ne dupliquent (AC-S2)', async () => {
        await recreateLegacyStockTable();

        await ensureStockTableExists();
        await expect(ensureStockTableExists()).resolves.toBeUndefined();

        const cols = await stockListColumns();
        expect(cols.filter(c => c === 'qrToken')).toHaveLength(1);
        expect((await stockListIndexes()).filter(i => i === 'InvStockList_qrToken_key')).toHaveLength(1);
    });

    it('crée l\'index sur une base MIGRÉE (AC-S5a)', async () => {
        await recreateLegacyStockTable();

        await ensureStockTableExists();

        expect(await stockListColumns()).toContain('qrToken');
        expect(await stockListIndexes()).toContain('InvStockList_qrToken_key');
    });

    it('crée l\'index sur une base NEUVE, table créée par la fonction (AC-S5b)', async () => {
        // Sans le DROP, la table préexiste et le CREATE TABLE de la fonction est
        // un no-op : le chemin « base neuve » ne serait jamais exercé.
        await db.execute(`DROP TABLE IF EXISTS "InvStockList"`);

        await ensureStockTableExists();

        expect(await stockListColumns()).toContain('qrToken');
        expect(await stockListIndexes()).toContain('InvStockList_qrToken_key');
    });

    it('n\'émet ni ALTER ni CREATE INDEX sur une base à jour (AC-S6)', async () => {
        await recreateLegacyStockTable();
        await ensureStockTableExists();

        // Second appel : seules les gardes doivent parler.
        const realExecute = db.execute.bind(db);
        const emitted: string[] = [];
        vi.spyOn(db, 'execute').mockImplementation(async (stmt: Parameters<typeof realExecute>[0]) => {
            emitted.push(typeof stmt === 'string' ? stmt : stmt.sql);
            return realExecute(stmt);
        });

        await ensureStockTableExists();
        vi.restoreAllMocks();

        expect(emitted.some(sql => /ALTER TABLE/i.test(sql))).toBe(false);
        expect(emitted.some(sql => /CREATE\s+UNIQUE\s+INDEX/i.test(sql))).toBe(false);
        expect(emitted.filter(sql => /PRAGMA index_list\("InvStockList"\)/.test(sql))).toHaveLength(1);
    });

    it('refuse deux stocks portant le même token (AC-S3)', async () => {
        await recreateLegacyStockTable();
        await ensureStockTableExists();

        await insertStock('stock-a', 'token-partage');
        await expect(insertStock('stock-b', 'token-partage')).rejects.toThrow();
    });

    it('laisse coexister autant de stocks sans token que voulu (AC-S4)', async () => {
        await recreateLegacyStockTable();
        await ensureStockTableExists();

        await insertStock('stock-a', null);
        await insertStock('stock-b', null);
        await insertStock('stock-c', null);

        const res = await db.execute(`SELECT COUNT(*) AS c FROM "InvStockList" WHERE qrToken IS NULL`);
        expect(Number(res.rows[0].c)).toBe(3);
    });
});

// ── Token QR ─────────────────────────────────────────────────────────────────

describe('token QR d\'un stock', () => {
    async function seedStock(id = 'stock-qr'): Promise<string> {
        await ensureStockTableExists();
        await db.execute({
            sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, 'Pharmacie', 'ul-paris-18', 0)`,
            args: [id],
        });
        return id;
    }

    it('crée le token à la première demande et le persiste', async () => {
        const id = await seedStock();

        const token = await getOrCreateStockQrToken(id);

        expect(token).toBeTruthy();
        const res = await db.execute({ sql: `SELECT qrToken FROM "InvStockList" WHERE id = ?`, args: [id] });
        expect(res.rows[0].qrToken).toBe(token);
    });

    it('rend le même token aux appels suivants', async () => {
        const id = await seedStock();

        const first = await getOrCreateStockQrToken(id);
        const second = await getOrCreateStockQrToken(id);

        expect(second).toBe(first);
    });

    it('rend null pour un stock inexistant', async () => {
        await ensureStockTableExists();
        expect(await getOrCreateStockQrToken('inconnu')).toBeNull();
    });

    it('régénère un token différent et invalide l\'ancien', async () => {
        const id = await seedStock();
        const first = await getOrCreateStockQrToken(id);

        const second = await regenerateStockQrToken(id);

        expect(second).not.toBe(first);
        expect(await resolveStockByQrToken(first!)).toBeNull();
        expect(await resolveStockByQrToken(second!)).toEqual({ id, name: 'Pharmacie' });
    });

    it('régénère en rendant null pour un stock inexistant', async () => {
        await ensureStockTableExists();
        expect(await regenerateStockQrToken('inconnu')).toBeNull();
    });

    it('résout le stock sans aucun filtre d\'UL', async () => {
        await ensureStockTableExists();
        await db.execute(`INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES ('stock-lyon', 'Stock Lyon', 'ul-lyon-3', 0)`);
        const token = await getOrCreateStockQrToken('stock-lyon');

        expect(await resolveStockByQrToken(token!)).toEqual({ id: 'stock-lyon', name: 'Stock Lyon' });
    });

    it('rend null pour un token inconnu', async () => {
        await ensureStockTableExists();
        expect(await resolveStockByQrToken('token-inexistant')).toBeNull();
    });
});
