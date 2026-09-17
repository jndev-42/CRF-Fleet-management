import { describe, it, expect } from 'vitest';
import { parseStockCsv, MAX_DATA_ROWS } from '@/lib/inventory/csvImport';

const HEADER = 'nom;categorie;quantite;date_peremption;stock_min;notes';

describe('parseStockCsv', () => {
    describe('CSV valide', () => {
        it('lit les colonnes et normalise les valeurs absentes', () => {
            const result = parseStockCsv(
                `${HEADER}\n` +
                'Pansement stérile;Matériel médical;50;2027-06-30;10;\n' +
                'Gants latex M;Protection;200;;;boîte de 100\n'
            );

            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows).toEqual([
                {
                    nom: 'Pansement stérile',
                    categorie: 'Matériel médical',
                    quantite: 50,
                    datePeremption: '2027-06-30',
                    stockMin: 10,
                    notes: null,
                },
                {
                    nom: 'Gants latex M',
                    categorie: 'Protection',
                    quantite: 200,
                    datePeremption: null,
                    stockMin: null,
                    notes: 'boîte de 100',
                },
            ]);
        });

        it('accepte une ligne réduite au seul nom, quantité par défaut à 0', () => {
            const result = parseStockCsv(`${HEADER}\nAttelle;;;;;\n`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows).toEqual([
                { nom: 'Attelle', categorie: null, quantite: 0, datePeremption: null, stockMin: null, notes: null },
            ]);
        });

        it('conserve les doublons de nom : aucune contrainte d\'unicité sur InvItem.name', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;1;;;\nGarrot;;2;;;\n`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows.map(r => r.nom)).toEqual(['Garrot', 'Garrot']);
        });

        it('ignore une ligne entièrement vide au milieu du fichier sans décaler les suivantes', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;1;;;\n\nAttelle;;2;;;\n`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows).toHaveLength(2);
        });

        it('respecte les guillemets : un point-virgule dans un champ ne le scinde pas', () => {
            const result = parseStockCsv(`${HEADER}\n"Compresses; stériles";Pansements;3;;;\n`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows[0].nom).toBe('Compresses; stériles');
        });
    });

    describe('BOM UTF-8', () => {
        it('retire le BOM en tête pour que la colonne « nom » reste reconnue', () => {
            const result = parseStockCsv(`﻿${HEADER}\nGarrot;;1;;;\n`);
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.rows[0].nom).toBe('Garrot');
        });
    });

    describe('lignes invalides', () => {
        it('rejette une ligne sans nom, avec son numéro et sa colonne', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;1;;;\n;Protection;5;;;\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.errors).toEqual([
                { line: 3, column: 'nom', reason: 'Le nom de l\'article est obligatoire' },
            ]);
        });

        it('rejette une quantité non numérique', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;beaucoup;;;\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toMatchObject({ line: 2, column: 'quantite' });
        });

        it('rejette un stock minimum non numérique et un nombre négatif', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;1;;abc;\nAttelle;;1;;-3;\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.errors.map(e => ({ line: e.line, column: e.column }))).toEqual([
                { line: 2, column: 'stock_min' },
                { line: 3, column: 'stock_min' },
            ]);
        });

        it('rejette une date inexistante ou mal formatée', () => {
            const result = parseStockCsv(`${HEADER}\nGarrot;;1;32/13/2026;;\nAttelle;;1;2026-02-30;;\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.errors.map(e => ({ line: e.line, column: e.column }))).toEqual([
                { line: 2, column: 'date_peremption' },
                { line: 3, column: 'date_peremption' },
            ]);
        });

        it('rapporte toutes les lignes en erreur, pas seulement la première', () => {
            const result = parseStockCsv(`${HEADER}\n;;1;;;\nGarrot;;x;;;\n;;1;;;\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.errors.map(e => e.line)).toEqual([2, 3, 4]);
        });
    });

    describe('fichier invalide', () => {
        it('rejette un fichier réduit à son en-tête', () => {
            const result = parseStockCsv(`${HEADER}\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.message).toContain('aucune ligne de données');
        });

        it('rejette un fichier vide', () => {
            const result = parseStockCsv('');
            expect(result.ok).toBe(false);
        });

        it('rejette un délimiteur incorrect en signalant la colonne « nom » absente', () => {
            const result = parseStockCsv('nom,categorie,quantite\nGarrot,Divers,1\n');
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.message).toContain('point-virgule');
            expect(result.errors).toEqual([
                { line: 1, column: 'nom', reason: 'Colonne obligatoire absente de l\'en-tête' },
            ]);
        });

        it(`rejette au-delà de ${MAX_DATA_ROWS} lignes de données`, () => {
            const lines = Array.from({ length: MAX_DATA_ROWS + 1 }, (_, i) => `Article ${i};;1;;;`);
            const result = parseStockCsv(`${HEADER}\n${lines.join('\n')}\n`);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.message).toContain(String(MAX_DATA_ROWS));
        });

        it(`accepte exactement ${MAX_DATA_ROWS} lignes de données`, () => {
            const lines = Array.from({ length: MAX_DATA_ROWS }, (_, i) => `Article ${i};;1;;;`);
            const result = parseStockCsv(`${HEADER}\n${lines.join('\n')}\n`);
            expect(result.ok).toBe(true);
        });
    });
});
