/**
 * UL d'un compte (`UserUL` ⨝ `UniteLocale`) et choix de l'UL active.
 *
 * Partagé par `src/auth.ts` (JWT de session) et le serveur MCP (`src/lib/mcp/tokens.ts`),
 * qui construit la session du propriétaire d'un jeton sur son UL d'attache.
 */
import { db } from "@/lib/db";

export type ULEntry = { id: string; name: string; slug: string; isHome: boolean; dtCode?: string | null; roles?: string[] };

export async function fetchUserULs(userId: string): Promise<ULEntry[]> {
    try {
        const res = await db.execute({
            sql: `SELECT ul.id, ul.name, ul.slug, ul.dtCode, uu.is_home, uu.roles
                  FROM "UserUL" uu
                  JOIN "UniteLocale" ul ON ul.id = uu.ulId
                  WHERE uu.userId = ?
                  ORDER BY uu.is_home DESC, ul.name ASC`,
            args: [userId],
        });
        return res.rows.map(r => {
            const rolesStr = r.roles as string | null;
            const roles = rolesStr 
                ? rolesStr.split(',').map(role => role.trim()).filter(Boolean) 
                : undefined;
            return {
                id: r.id as string,
                name: r.name as string,
                slug: r.slug as string,
                isHome: !!r.is_home,
                dtCode: (r.dtCode as string) || null,
                roles,
            };
        });
    } catch {
        return [];
    }
}

/** Retourne l'ulId actif : UL d'appartenance (is_home=1) en priorité, sinon première UL disponible, sinon 'default' */
export function resolveActiveUL(uls: ULEntry[]): string {
    if (uls.length === 0) return 'default';
    const home = uls.find(u => u.isHome);
    return home ? home.id : uls[0].id;
}
