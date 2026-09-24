import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';

/** GET /api/settings/menus — Retourne tous les paramètres de visibilité des menus.
 *
 *  Ouvert à tout compte connecté : la barre de navigation de CHAQUE utilisateur
 *  en a besoin pour masquer un menu désactivé ou réservé. Réservée au
 *  SUPER_ADMIN, la lecture renvoyait 403 à tous les autres, et
 *  `MenuSettingsProvider` retombait alors sur « available » — les réglages ne
 *  s'appliquaient qu'au SUPER_ADMIN lui-même. La modification (PATCH) reste
 *  réservée au SUPER_ADMIN. Ces réglages ne sont pas sensibles. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

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
