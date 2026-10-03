/**
 * Catalogue des thèmes saisonniers — défini dans le code (habillage = composants + CSS).
 * La base ne stocke que l'activation et la plage de dates de chaque thème.
 *
 * Les plages sont des jours calendaires `YYYY-MM-DD`, bornes incluses, lus en
 * Europe/Paris : comparables en texte, donc sans conversion de fuseau.
 */

export interface SeasonalThemeDef {
    key: string;
    label: string;
    description: string;
}

export const SEASONAL_THEMES: readonly SeasonalThemeDef[] = [
    {
        key: 'vendanges-montmartre',
        label: 'Fête des vendanges de Montmartre',
        description: 'Petites grappes et feuilles de vigne posées sur les titres, et un sarment qui pend de la barre de navigation.',
    },
];

export const THEME_KEYS: readonly string[] = SEASONAL_THEMES.map(t => t.key);

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ThemeRow {
    theme_key: string;
    enabled: boolean;
    start_date: string | null;
    end_date: string | null;
    /** UL ciblées ; liste vide = toutes les UL. */
    ul_ids: string[];
}

export interface DateRange {
    start: string;
    end: string;
}

/** Jour calendaire courant à Paris, au format `YYYY-MM-DD`. */
export function parisToday(now: Date = new Date()): string {
    // La locale `en-CA` formate nativement en AAAA-MM-JJ.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/** Actif : activé, plage complète et jour courant dans la plage (bornes incluses). */
export function isThemeActive(row: ThemeRow, today: string): boolean {
    if (!row.enabled || !row.start_date || !row.end_date) return false;
    return row.start_date <= today && today <= row.end_date;
}

/** Le thème s'applique-t-il à l'UL active ? Liste vide = toutes ; sans UL active, seulement « toutes ». */
export function matchesUl(row: Pick<ThemeRow, 'ul_ids'>, ulId: string | null | undefined): boolean {
    if (row.ul_ids.length === 0) return true;
    return !!ulId && row.ul_ids.includes(ulId);
}

/** Deux périmètres d'UL se recouvrent-ils ? « Toutes les UL » (liste vide) recouvre n'importe quelle liste. */
export function scopesOverlap(a: string[], b: string[]): boolean {
    if (a.length === 0 || b.length === 0) return true;
    return a.some(id => b.includes(id));
}

/** Premier thème actif du catalogue pour l'UL active, ou `null`. */
export function pickActiveTheme(rows: ThemeRow[], today: string, ulId?: string | null): ThemeRow | null {
    return rows.find(r => THEME_KEYS.includes(r.theme_key) && isThemeActive(r, today) && matchesUl(r, ulId)) ?? null;
}

/** Deux plages (bornes incluses) se recouvrent-elles ? */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
    return a.start <= b.end && b.start <= a.end;
}

export type ThemeStatus = 'active' | 'scheduled' | 'inactive';

/** Statut d'affichage : actif aujourd'hui, programmé (activé, plage à venir) ou inactif. */
export function themeStatus(row: Pick<ThemeRow, 'enabled' | 'start_date' | 'end_date'>, today: string): ThemeStatus {
    if (!row.enabled || !row.start_date || !row.end_date) return 'inactive';
    if (row.start_date <= today && today <= row.end_date) return 'active';
    return today < row.start_date ? 'scheduled' : 'inactive';
}
