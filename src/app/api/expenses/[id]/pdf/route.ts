import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

// Lecture R2 et manipulation de Buffer : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        const ownershipRes = await db.execute({
            sql: `SELECT userId, status, r2Key FROM "ExpenseReport" WHERE id = ?`,
            args: [id],
        });
        const row = ownershipRes.rows[0];
        if (!row) {
            return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
        }

        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isTresorier = roles.includes('TRESORIER');
        const isOwner = row.userId === session.user.id;
        if (!isManager && !isOwner && !(isTresorier && row.status === 'en_attente_paiement')) {
            return forbiddenResponse();
        }

        const r2Key = (row.r2Key as string) || null;
        const status = row.status as string;

        // ── Chemin nominal : proxy pur depuis R2 ─────────────────────────────
        if (r2Key) {
            const { getObject } = await import('@/lib/r2');
            const buffer = await getObject(r2Key);
            if (!buffer) {
                // La base référence une clé absente du bucket : anomalie à
                // diagnostiquer, jamais à masquer par une régénération silencieuse
                // (le PDF régénéré ne porterait aucune signature).
                console.error(`[expenses/pdf] objet R2 introuvable pour ${id} : ${r2Key}`);
                return NextResponse.json({
                    error: 'Le document scellé est introuvable. Contactez un administrateur.',
                }, { status: 409 });
            }
            return pdfResponse(buffer, id);
        }

        // ── Aucune clé R2 ────────────────────────────────────────────────────
        // Un brouillon n'a jamais de document scellé : c'est normal.
        if (status === 'brouillon') {
            return NextResponse.json({
                error: 'Cette note de frais est un brouillon : aucun document scellé n\'existe encore.',
            }, { status: 404 });
        }

        // Toute autre note DOIT en avoir un : la soumission ne promeut jamais une
        // note sans la sceller, et le backfill a couvert l'antériorité (couverture
        // vérifiée à 100 % avant le retrait du repli qui existait ici).
        //
        // ⚠️ NE JAMAIS RÉGÉNÉRER À LA VOLÉE. Le PDF reconstruit ne porterait
        // AUCUNE signature tout en ayant l'apparence d'un document officiel : le
        // lecteur ne verrait pas la différence, et l'anomalie resterait invisible.
        // Mieux vaut refuser et la faire remonter.
        console.error(`[expenses/pdf] note ${id} [${status}] sans clé R2 — aucun document scellé`);
        return NextResponse.json({
            error: 'Le document scellé est introuvable. Contactez un administrateur.',
        }, { status: 409 });
    } catch (error) {
        console.error('[GET /api/expenses/[id]/pdf]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la récupération du PDF.' }, { status: 500 });
    }
}

function pdfResponse(buffer: Buffer, id: string): NextResponse {
    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="note-de-frais-${id}.pdf"`,
            'Content-Length': String(buffer.length),
        },
    });
}
