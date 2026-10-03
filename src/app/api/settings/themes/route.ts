import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { SEASONAL_THEMES, parisToday, themeStatus } from '@/lib/themes/catalog';

/** GET /api/settings/themes — Catalogue des thèmes fusionné avec leur configuration.
 *  SUPER_ADMIN uniquement. Un thème sans ligne est désactivé, sans dates. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!isSuperAdmin(roles)) {
            return forbiddenResponse();
        }

        const result = await db.execute(`SELECT theme_key, enabled, start_date, end_date FROM "SeasonalTheme"`);
        const byKey = new Map(result.rows.map(row => [row.theme_key as string, row]));
        const today = parisToday();

        const themes = SEASONAL_THEMES.map(def => {
            const row = byKey.get(def.key);
            const enabled = Number(row?.enabled ?? 0) === 1;
            const startDate = (row?.start_date as string | null | undefined) ?? null;
            const endDate = (row?.end_date as string | null | undefined) ?? null;
            return {
                key: def.key,
                label: def.label,
                description: def.description,
                enabled,
                startDate,
                endDate,
                status: themeStatus({ enabled, start_date: startDate, end_date: endDate }, today),
            };
        });

        return NextResponse.json({ themes });
    } catch (error) {
        console.error('Error fetching seasonal themes:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des thèmes' }, { status: 500 });
    }
}
