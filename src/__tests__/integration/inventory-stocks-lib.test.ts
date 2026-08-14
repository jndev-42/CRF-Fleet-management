/**
 * Tests d'intégration — src/lib/inventory/stocks.ts (getOrCreateDefaultStock).
 * DB réelle (pas de mock).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { getOrCreateDefaultStock } from '@/lib/inventory/stocks';
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
