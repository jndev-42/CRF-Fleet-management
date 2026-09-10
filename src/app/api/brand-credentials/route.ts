/**
 * Compte constructeur d'une unité locale — lecture seule.
 *
 * Alimente la modale de connexion : « Compte MyRenault de l'UL : x@y.fr », qui
 * permet de réduire la saisie au VIN dès le 2ᵉ véhicule.
 *
 * ⚠️ `passwordEncrypted` n'apparaît **jamais dans le `SELECT`**. L'absence dans
 * la requête est la garantie — pas un `delete` après coup, qu'un refactor
 * pourrait retirer sans que rien ne casse.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { BRANDS, isBrand } from '@/lib/brands';
import { getErrorMessage } from '@/lib/utils/error';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();

        const roles = session.user.roles || [];
        // Le login est l'adresse du compte constructeur de l'UL : réservé aux
        // administrateurs, comme l'écriture qu'il prépare.
        if (!isSuperAdmin(roles) && !isAdmin(roles)) return forbiddenResponse();

        const url = new URL(request.url);
        const brand = url.searchParams.get('brand') ?? BRANDS[0];
        if (!isBrand(brand)) {
            return NextResponse.json({ error: 'Marque inconnue' }, { status: 400 });
        }

        // `?ulId=` traverse les unités locales : réservé au SUPER_ADMIN.
        const requestedUlId = url.searchParams.get('ulId');
        if (requestedUlId && !isSuperAdmin(roles)) return forbiddenResponse();

        const ulId = requestedUlId ?? session.user.ulId ?? null;
        if (!ulId) return NextResponse.json({ credential: null });

        const res = await db.execute({
            sql: `SELECT brand, login FROM BrandCredential WHERE ulId = ? AND brand = ?`,
            args: [ulId, brand],
        });
        const row = res.rows[0];
        if (!row) return NextResponse.json({ credential: null });

        return NextResponse.json({
            credential: { brand: String(row.brand), login: String(row.login) },
        });
    } catch (e: unknown) {
        console.error('[vehicle-connection] GET /api/brand-credentials:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
