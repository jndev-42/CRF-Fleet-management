import { describe, it, expect } from 'vitest';
import {
    addDays,
    activeAlertKeys,
    addOneMonth,
    buildStockDigestTitle,
    formatFrDay,
    normalizeDay,
    restrictDigest,
    batchKey,
    buildDesinfMessage,
    buildStockDigestMessage,
    desinfKey,
    detectDesinfAlerts,
    detectStockDigests,
    isLow,
    itemLowKey,
    staleItemLowKeys,
    type DesinfVehicle,
    type StockBatch,
    type StockItem,
} from '@/lib/alerts/detect';

const TODAY = '2026-10-22';
const none = new Set<string>();

const vehicle = (nextDesinfMaxDate: string, id = 'v1'): DesinfVehicle => ({ id, name: 'VPSP 182', ulId: 'ul-a', nextDesinfMaxDate });
const batch = (expiryDate: string, batchId = 'b1', ulId = 'ul-a'): StockBatch =>
    ({ batchId, itemId: `i-${batchId}`, itemName: `Produit ${batchId}`, ulId, expiryDate });
const item = (quantity: number, minStock: number | null, id = 'i1', ulId = 'ul-a'): StockItem =>
    ({ id, name: `Produit ${id}`, ulId, quantity, minStock });

describe('dates', () => {
    it('addDays traverse les fins de mois et d\'année', () => {
        expect(addDays('2026-10-22', 14)).toBe('2026-11-05');
        expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    });
    it('addOneMonth ajoute un mois calendaire', () => {
        expect(addOneMonth('2026-10-22')).toBe('2026-11-22');
        expect(addOneMonth('2026-12-15')).toBe('2027-01-15');
    });
});

describe('detectDesinfAlerts', () => {
    it('alerte « bientôt due » à 14 jours ou moins, pas au-delà', () => {
        expect(detectDesinfAlerts([vehicle('2026-11-05')], TODAY, none)[0]).toMatchObject({ stage: 'soon', key: desinfKey('soon', 'v1', '2026-11-05') });
        expect(detectDesinfAlerts([vehicle('2026-11-06')], TODAY, none)).toEqual([]);
    });
    it('échéance du jour : encore « bientôt due »', () => {
        expect(detectDesinfAlerts([vehicle(TODAY)], TODAY, none)[0].stage).toBe('soon');
    });
    it('échéance passée : seule « dépassée »', () => {
        const alerts = detectDesinfAlerts([vehicle('2026-10-21')], TODAY, none);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].stage).toBe('overdue');
    });
    it('ne renvoie rien si la clé est déjà envoyée, et relance sur une nouvelle date', () => {
        const sent = new Set([desinfKey('soon', 'v1', '2026-11-01')]);
        expect(detectDesinfAlerts([vehicle('2026-11-01')], TODAY, sent)).toEqual([]);
        expect(detectDesinfAlerts([vehicle('2027-02-01')], TODAY, sent)).toEqual([]);
        expect(detectDesinfAlerts([vehicle('2026-11-03')], TODAY, sent)).toHaveLength(1);
    });
    it('« dépassée » part même si « bientôt due » a déjà été envoyée', () => {
        const sent = new Set([desinfKey('soon', 'v1', '2026-10-21')]);
        expect(detectDesinfAlerts([vehicle('2026-10-21')], TODAY, sent)[0].stage).toBe('overdue');
    });
});

describe('detectStockDigests', () => {
    it('classe lots bientôt périmés, périmés et produits sous le minimum', () => {
        const [digest] = detectStockDigests(
            [batch('2026-11-22', 'b1'), batch('2026-11-23', 'b2'), batch('2026-10-01', 'b3')],
            [item(1, 5), item(5, 5, 'i2'), item(0, null, 'i3')],
            TODAY,
            none,
        );
        expect(digest.soonBatches.map(b => b.batchId)).toEqual(['b1']);
        expect(digest.expiredBatches.map(b => b.batchId)).toEqual(['b3']);
        expect(digest.lowItems.map(i => i.id)).toEqual(['i1']);
        expect(digest.keys).toEqual([
            batchKey('soon', 'b1', '2026-11-22'),
            batchKey('expired', 'b3', '2026-10-01'),
            itemLowKey('i1'),
        ]);
    });
    it('un résumé par UL, avec seulement les nouveautés', () => {
        const sent = new Set([batchKey('soon', 'b1', '2026-11-01')]);
        const digests = detectStockDigests(
            [batch('2026-11-01', 'b1', 'ul-a'), batch('2026-11-01', 'b2', 'ul-b')],
            [],
            TODAY,
            sent,
        );
        expect(digests).toHaveLength(1);
        expect(digests[0].ulId).toBe('ul-b');
    });
    it('rien de nouveau : aucun résumé', () => {
        const sent = new Set([batchKey('soon', 'b1', '2026-11-01'), itemLowKey('i1')]);
        expect(detectStockDigests([batch('2026-11-01')], [item(0, 3)], TODAY, sent)).toEqual([]);
    });
});

describe('isLow / staleItemLowKeys', () => {
    it('isLow compare la quantité au minimum', () => {
        expect(isLow(item(2, 3))).toBe(true);
        expect(isLow(item(3, 3))).toBe(false);
        expect(isLow(item(0, null))).toBe(false);
    });
    it('staleItemLowKeys ne retient que les item-low de produits qui ne sont plus bas', () => {
        const keys = [itemLowKey('i1'), itemLowKey('i2'), batchKey('soon', 'b1', '2026-11-01')];
        expect(staleItemLowKeys(keys, new Set(['i1']))).toEqual([itemLowKey('i2')]);
    });
});

describe('normalizeDay / formatFrDay', () => {
    it('garde les 10 premiers caractères d\'une date ISO et rejette le reste', () => {
        expect(normalizeDay('2026-11-05')).toBe('2026-11-05');
        expect(normalizeDay('2026-11-05T10:00:00.000Z')).toBe('2026-11-05');
        expect(normalizeDay('')).toBeNull();
        expect(normalizeDay('05/11/2026')).toBeNull();
        expect(normalizeDay(null)).toBeNull();
        expect(normalizeDay(20261105)).toBeNull();
    });
    it('formatFrDay donne jj/mm/aaaa', () => {
        expect(formatFrDay('2026-11-05')).toBe('05/11/2026');
    });
});

describe('activeAlertKeys / restrictDigest / titre', () => {
    it('activeAlertKeys liste les clés courantes même déjà envoyées', () => {
        const keys = activeAlertKeys([vehicle('2026-10-01')], [batch('2026-11-01')], [item(0, 2)], TODAY);
        expect(keys).toEqual(new Set([
            desinfKey('overdue', 'v1', '2026-10-01'),
            batchKey('soon', 'b1', '2026-11-01'),
            itemLowKey('i1'),
        ]));
    });
    it('restrictDigest ne garde que les clés réservées', () => {
        const [digest] = detectStockDigests([batch('2026-11-01', 'b1'), batch('2026-10-01', 'b2')], [item(0, 2)], TODAY, none);
        const mine = restrictDigest(digest, new Set([batchKey('expired', 'b2', '2026-10-01')]));
        expect(mine.soonBatches).toEqual([]);
        expect(mine.expiredBatches.map(b => b.batchId)).toEqual(['b2']);
        expect(mine.lowItems).toEqual([]);
        expect(mine.keys).toEqual([batchKey('expired', 'b2', '2026-10-01')]);
    });
    it('le titre porte le nom de l\'UL quand il est connu', () => {
        expect(buildStockDigestTitle('Paris 18')).toBe('Inventaire : alertes du jour (Paris 18)');
        expect(buildStockDigestTitle(null)).toBe('Inventaire : alertes du jour');
    });
});

describe('messages', () => {
    it('résumé : compteurs accordés puis premiers noms', () => {
        const [digest] = detectStockDigests(
            [batch('2026-11-01', 'b1'), batch('2026-11-02', 'b2'), batch('2026-11-03', 'b3'), batch('2026-10-01', 'b4')],
            [item(0, 2, 'i1'), item(0, 2, 'i2')],
            TODAY,
            none,
        );
        const message = buildStockDigestMessage(digest);
        expect(message).toContain('3 lots bientôt périmés, 1 lot périmé, 2 produits sous le stock minimum');
        expect(message).toMatch(/\. Produit b1, Produit b2, Produit b3 et 3 autres$/);
    });
    it('résumé : singulier sans ellipse', () => {
        const [digest] = detectStockDigests([], [item(0, 2)], TODAY, none);
        expect(buildStockDigestMessage(digest)).toBe('1 produit sous le stock minimum. Produit i1');
    });
    it('désinfection : titres distincts selon l\'étape', () => {
        const [soon] = detectDesinfAlerts([vehicle('2026-11-01')], TODAY, none);
        const [overdue] = detectDesinfAlerts([vehicle('2026-10-01')], TODAY, none);
        expect(buildDesinfMessage(soon).message).toContain('01/11/2026');
        expect(buildDesinfMessage(soon).title).toContain('bientôt due');
        expect(buildDesinfMessage(overdue).title).toContain('dépassée');
    });
});
