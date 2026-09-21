import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/ul/[id]/qr-token
 * Retourne (ou crée paresseusement) le token QR de l'UL — celui qu'imprime la
 * vignette collée au poste, et qui ouvre `/qr-ul/[token]`.
 * Accessible à tout compte authentifié — modèle `/api/vehicles/[id]/qr-token`.
 *
 * POST /api/ul/[id]/qr-token
 * Identique à GET — cohérence sémantique avec la modale QR des véhicules.
 *
 * DELETE /api/ul/[id]/qr-token
 * Régénère le token (invalide les QR déjà imprimés). Réservé aux profils qui
 * accèdent au panneau d'administration.
 */

async function getOrCreateToken(ulId: string): Promise<string> {
    const res = await db.execute({
        sql: `SELECT id, qrToken FROM "UniteLocale" WHERE id = ?`,
        args: [ulId],
    });

    if (res.rows.length === 0) {
        throw new Error('UL not found');
    }

    const existing = res.rows[0].qrToken as string | null;
    if (existing) return existing;

    // Lazy-create: conditional UPDATE so a concurrent first-creation race
    // leaves only one winner — re-SELECT to return whichever value won.
    const candidate = crypto.randomUUID();
    await db.execute({
        sql: `UPDATE "UniteLocale" SET qrToken = ? WHERE id = ? AND qrToken IS NULL`,
        args: [candidate, ulId],
    });
    const winner = await db.execute({
        sql: `SELECT qrToken FROM "UniteLocale" WHERE id = ?`,
        args: [ulId],
    });
    return winner.rows[0].qrToken as string;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }
    if (!canAccessAdminPanel(session.user.roles || [])) {
        return forbiddenResponse();
    }

    const { id } = await params;

    try {
        const token = await getOrCreateToken(id);
        return NextResponse.json({ token });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'UL not found') {
            return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });
        }
        console.error('Error getting UL QR token:', e);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return GET(request, { params });
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }
    if (!canAccessAdminPanel(session.user.roles || [])) {
        return forbiddenResponse();
    }

    const { id } = await params;

    const newToken = crypto.randomUUID();
    const res = await db.execute({
        sql: `UPDATE "UniteLocale" SET qrToken = ? WHERE id = ?`,
        args: [newToken, id],
    });

    if (res.rowsAffected === 0) {
        return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });
    }

    return NextResponse.json({ token: newToken });
}
