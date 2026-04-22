import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

/** GET /api/settings/modules — Retourne tous les paramètres de visibilité des modules.
 *  ADMIN uniquement. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const result = await db.execute(`SELECT module_key, allowed_roles FROM "ModuleSetting" ORDER BY module_key`);

        const settings = result.rows.map(row => ({
            module_key: row.module_key as string,
            allowed_roles: JSON.parse(row.allowed_roles as string),
        }));

        return NextResponse.json({ settings });
    } catch (error) {
        console.error('Error fetching module settings:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des paramètres' }, { status: 500 });
    }
}
