import { db } from '@/lib/db';

/** UL ciblées par thème (`theme_key` → ids). Un thème absent de la map vise toutes les UL.
 *  Les ids qui ne correspondent plus à une UL existante (orphelins) sont ignorés. */
export async function loadThemeUlScopes(): Promise<Map<string, string[]>> {
    const result = await db.execute(`SELECT s.theme_key, s.ul_id FROM "SeasonalThemeUL" s
                                 JOIN "UniteLocale" u ON u.id = s.ul_id ORDER BY s.ul_id`);
    const scopes = new Map<string, string[]>();
    for (const row of result.rows) {
        const key = row.theme_key as string;
        const list = scopes.get(key);
        if (list) list.push(row.ul_id as string);
        else scopes.set(key, [row.ul_id as string]);
    }
    return scopes;
}
