import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAdminOrForbidden } from '@/lib/utils/auth-server';

/** GET /api/settings/menus — Retourne tous les paramètres de visibilité des menus.
 *  ADMIN uniquement. */
export async function GET() {
    try {
        const { response: forbiddenResponse } = await checkAdminOrForbidden();
        if (forbiddenResponse) return forbiddenResponse;

        const result = await db.execute(`SELECT menu_key, visibility FROM "MenuSetting" ORDER BY menu_key`);

        const settings = result.rows.map(row => ({
            menu_key: row.menu_key as string,
            visibility: row.visibility as string,
        }));

        return NextResponse.json({ settings });
    } catch (error) {
        console.error('Error fetching menu settings:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des paramètres' }, { status: 500 });
    }
}
