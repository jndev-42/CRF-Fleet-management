import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { isInactive } from '@/lib/roles';
import { parisToday, pickActiveTheme, type ThemeRow } from '@/lib/themes/catalog';

/** GET /api/themes/active — Thème saisonnier actif aujourd'hui (Europe/Paris).
 *
 *  Ouvert à tout compte connecté : l'habillage s'applique à chaque utilisateur.
 *  `startDate` identifie la plage (une nouvelle plage réaffiche un thème masqué). */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        // Un compte INACTIF n'a droit à aucun habillage (la navbar s'affiche sur /inactif).
        if (isInactive((session.user.roles || []) as string[])) {
            return forbiddenResponse();
        }

        const result = await db.execute(`SELECT theme_key, enabled, start_date, end_date FROM "SeasonalTheme" WHERE enabled = 1`);
        const rows: ThemeRow[] = result.rows.map(row => ({
            theme_key: row.theme_key as string,
            enabled: Number(row.enabled) === 1,
            start_date: (row.start_date as string | null) ?? null,
            end_date: (row.end_date as string | null) ?? null,
        }));

        const active = pickActiveTheme(rows, parisToday());
        return NextResponse.json({
            theme: active?.theme_key ?? null,
            startDate: active?.start_date ?? null,
        });
    } catch (error) {
        console.error('Error fetching active theme:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération du thème actif' }, { status: 500 });
    }
}
