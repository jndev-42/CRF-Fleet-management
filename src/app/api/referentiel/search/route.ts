/**
 * GET /api/referentiel/search?q= — recherche plein texte dans le référentiel actif.
 *
 * Aucune génération : on renvoie les 5 pages les plus pertinentes (bm25), avec
 * l'extrait officiel dont les termes trouvés sont encadrés de \u0002 … \u0003
 * (le client les transforme en surlignage, jamais en HTML).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { buildFtsQuery } from '@/lib/referentiel/query';
import { getReadyReferentiel } from '@/lib/referentiel/repository';
import { REFERENTIEL_FTS_TABLE } from '@/lib/referentiel/schema';

const MAX_RESULTS = 5;

const searchSchema = z.object({
    q: z.string().trim().min(2, 'Question trop courte').max(200, 'Question trop longue'),
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const parsed = searchSchema.safeParse({ q: new URL(request.url).searchParams.get('q') ?? '' });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const active = await getReadyReferentiel();
        if (!active) return NextResponse.json({ ready: false, results: [] });

        const match = buildFtsQuery(parsed.data.q);
        if (!match) return NextResponse.json({ ready: true, results: [] });

        // Filtré sur la version `ready` : pendant un nouvel import, l'ancienne répond toujours.
        const res = await db.execute({
            sql: `SELECT p.page AS page, p.title AS title,
                         snippet("${REFERENTIEL_FTS_TABLE}", 1, char(2), char(3), '…', 24) AS excerpt
                    FROM "${REFERENTIEL_FTS_TABLE}"
                    JOIN ReferentielPage p ON p.id = "${REFERENTIEL_FTS_TABLE}".rowid
                   WHERE "${REFERENTIEL_FTS_TABLE}" MATCH ? AND p.referentielId = ?
                   ORDER BY bm25("${REFERENTIEL_FTS_TABLE}", 5.0, 1.0)
                   LIMIT ${MAX_RESULTS}`,
            args: [match, active.id],
        });

        return NextResponse.json({
            ready: true,
            results: res.rows.map(r => ({
                page: Number(r.page),
                title: String(r.title ?? ''),
                excerpt: String(r.excerpt ?? ''),
            })),
        });
    } catch (e: unknown) {
        console.error('GET /api/referentiel/search error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
