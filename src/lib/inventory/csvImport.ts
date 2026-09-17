/**
 * Lecture et validation du CSV d'import massif d'articles de stock.
 *
 * Isolé de la base : la fonction est purement `string -> lignes | erreurs`, ce qui
 * la rend testable sans DB et garantit que la route n'écrit rien tant que le
 * fichier entier n'est pas valide (import tout-ou-rien).
 */

import Papa from 'papaparse';
import { z } from 'zod';

/** Colonnes attendues dans l'en-tête, dans l'ordre documenté. */
export const CSV_COLUMNS = ['nom', 'categorie', 'quantite', 'date_peremption', 'stock_min', 'notes'] as const;

/** Séparateur imposé : c'est celui de l'export CSV d'Excel en configuration française. */
const CSV_DELIMITER = ';';

/**
 * Plafond de lignes de données. Au-delà, l'import dépasserait le budget temps de
 * la route serverless — mieux vaut un refus explicite qu'un timeout opaque.
 */
export const MAX_DATA_ROWS = 2000;

/** Ligne validée, prête à être insérée. */
export interface ParsedRow {
    nom: string;
    categorie: string | null;
    quantite: number;
    datePeremption: string | null;
    stockMin: number | null;
    notes: string | null;
}

/** Erreur imputée à une ligne précise du fichier (`line` = numéro réel, en-tête = 1). */
export interface CsvLineError {
    line: number;
    column: string;
    reason: string;
}

export type ParseStockCsvResult =
    | { ok: true; rows: ParsedRow[] }
    | { ok: false; message: string; errors: CsvLineError[] };

/**
 * Entier positif ou nul, saisi sous forme de texte. Une chaîne vide vaut « non
 * renseigné » ; `/^\d+$/` rejette d'un coup le texte, les décimaux et les négatifs.
 */
function optionalInteger(label: string) {
    return z
        .string()
        .refine(v => v === '' || (/^\d+$/.test(v) && Number(v) <= Number.MAX_SAFE_INTEGER), {
            message: `${label} doit être un nombre entier positif ou nul`,
        })
        .transform(v => (v === '' ? null : Number(v)));
}

/**
 * `AAAA-MM-JJ` **et** date réellement existante : le format seul laisserait passer
 * `2026-13-32`, que SQLite stockerait tel quel dans `InvBatch.expiryDate`.
 */
function isRealIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    // `Date.UTC(year, ...)` réinterprète un an 0-99 comme 1900+an (quirk JS hérité de
    // `Date.setYear`) : on construit sur une année sûre puis on fixe l'année réelle
    // via `setUTCFullYear`, qui n'applique pas ce rebasing.
    const date = new Date(Date.UTC(2000, month - 1, day));
    date.setUTCFullYear(year);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const rowSchema = z.object({
    nom: z.string().min(1, 'Le nom de l\'article est obligatoire'),
    categorie: z.string().transform(v => (v === '' ? null : v)),
    quantite: optionalInteger('La quantité').transform(v => v ?? 0),
    date_peremption: z
        .string()
        .refine(v => v === '' || isRealIsoDate(v), {
            message: 'La date de péremption doit être une date valide au format AAAA-MM-JJ',
        })
        .transform(v => (v === '' ? null : v)),
    stock_min: optionalInteger('Le stock minimum'),
    notes: z.string().transform(v => (v === '' ? null : v)),
});

/**
 * Parse et valide le contenu d'un CSV d'import de stock.
 *
 * Ordre de validation imposé par la spec : parsing, puis nombre de lignes, puis
 * validation ligne par ligne. Toute erreur annule l'import entier — d'où le
 * retour d'une **liste** d'erreurs plutôt qu'un arrêt à la première.
 */
export function parseStockCsv(content: string): ParseStockCsvResult {
    // Excel FR préfixe systématiquement ses exports d'un BOM UTF-8 ; sans ce retrait,
    // la première colonne s'appellerait "﻿nom" et `nom` semblerait absente.
    const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

    const parsed = Papa.parse<Record<string, string | undefined>>(cleaned, {
        header: true,
        delimiter: CSV_DELIMITER,
        // Les lignes vides sont filtrées plus bas, à la main : `skipEmptyLines`
        // décalerait la numérotation des lignes rapportées à l'utilisateur.
        skipEmptyLines: false,
    });

    // Un nombre de champs différent de l'en-tête n'est pas fatal (Excel élide
    // volontiers les derniers séparateurs) : les colonnes manquantes sont lues
    // comme vides, les colonnes en trop ignorées. Les guillemets non fermés, si.
    const fatalParseErrors = parsed.errors.filter(e => e.type === 'Quotes');
    if (fatalParseErrors.length > 0) {
        return {
            ok: false,
            message: 'Le fichier CSV n\'a pas pu être lu.',
            errors: fatalParseErrors.map(e => ({
                line: (e.row ?? 0) + 2,
                column: '',
                reason: e.message,
            })),
        };
    }

    const headers = parsed.meta.fields ?? [];
    if (!headers.includes('nom')) {
        return {
            ok: false,
            message: 'La colonne « nom » est absente de l\'en-tête. Vérifiez que le séparateur est bien un point-virgule (;).',
            errors: [{ line: 1, column: 'nom', reason: 'Colonne obligatoire absente de l\'en-tête' }],
        };
    }

    // Numéro de ligne réel du fichier : l'en-tête occupe la ligne 1.
    const dataRows = parsed.data
        .map((record, index) => ({ record, line: index + 2 }))
        .filter(({ record }) => CSV_COLUMNS.some(column => (record[column] ?? '').trim() !== ''));

    if (dataRows.length === 0) {
        return {
            ok: false,
            message: 'Le fichier CSV ne contient aucune ligne de données.',
            errors: [],
        };
    }

    if (dataRows.length > MAX_DATA_ROWS) {
        return {
            ok: false,
            message: `Le fichier CSV contient ${dataRows.length} lignes de données : le maximum autorisé est de ${MAX_DATA_ROWS}.`,
            errors: [],
        };
    }

    const rows: ParsedRow[] = [];
    const errors: CsvLineError[] = [];

    for (const { record, line } of dataRows) {
        // Valeurs trimées avant Zod : le schéma raisonne uniquement sur des
        // chaînes normalisées, et `" "` doit valoir « non renseigné ».
        const raw = Object.fromEntries(
            CSV_COLUMNS.map(column => [column, (record[column] ?? '').trim()])
        ) as Record<(typeof CSV_COLUMNS)[number], string>;

        const result = rowSchema.safeParse(raw);
        if (!result.success) {
            for (const issue of result.error.issues) {
                errors.push({
                    line,
                    column: String(issue.path[0] ?? ''),
                    reason: issue.message,
                });
            }
            continue;
        }

        rows.push({
            nom: result.data.nom,
            categorie: result.data.categorie,
            quantite: result.data.quantite,
            datePeremption: result.data.date_peremption,
            stockMin: result.data.stock_min,
            notes: result.data.notes,
        });
    }

    if (errors.length > 0) {
        return {
            ok: false,
            message: 'Le fichier CSV contient des lignes invalides. Corrigez-les puis relancez l\'import.',
            errors,
        };
    }

    return { ok: true, rows };
}
