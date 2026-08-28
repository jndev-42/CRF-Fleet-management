import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

// Lecture R2 et, pour les notes antérieures, rendu PDF : runtime Node requis.
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

        // ── Repli TEMPORAIRE pour les notes antérieures au scellement ────────
        // Borné aux notes non-brouillon sans clé R2, c'est-à-dire uniquement
        // celles créées avant cette fonctionnalité. Un brouillon n'a jamais de
        // PDF : il renvoie 404.
        //
        // ⚠️ Ce chemin DISPARAÎT avec l'étape 7.3, dans la MÊME release, une fois
        // le backfill vérifié. Le compteur ci-dessous indique quand c'est sûr :
        // zéro avertissement sur une fenêtre d'observation = retrait sans risque.
        if (status === 'brouillon') {
            return NextResponse.json({
                error: 'Cette note de frais est un brouillon : aucun document scellé n\'existe encore.',
            }, { status: 404 });
        }

        console.warn(`[pdf] fallback legacy ${id}`);
        const { generateExpensePdf } = await import('@/lib/expenses/pdf');
        return pdfResponse(await generateExpensePdf(id), id);
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
