import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel } from '@/lib/roles';

/**
 * GET /api/vehicles/[id]/qr-token
 * Returns (or lazily creates) the QR bypass token for a vehicle.
 * Accessible to all authenticated non-INACTIF users who have access to the vehicle.
 *
 * POST /api/vehicles/[id]/qr-token
 * Same as GET — kept for semantic consistency, also used by QRCodeModal.
 *
 * DELETE /api/vehicles/[id]/qr-token
 * Regenerates the token (invalidates old QR codes). Admin only.
 */

async function getOrCreateToken(vehicleId: string): Promise<string> {
    const res = await db.execute({
        sql: `SELECT id, qrToken FROM Vehicle WHERE id = ?`,
        args: [vehicleId],
    });

    if (res.rows.length === 0) {
        throw new Error('Vehicle not found');
    }

    const existing = res.rows[0].qrToken as string | null;
    if (existing) return existing;

    // Lazy-create a new token
    const token = crypto.randomUUID();
    await db.execute({
        sql: `UPDATE Vehicle SET qrToken = ? WHERE id = ?`,
        args: [token, vehicleId],
    });
    return token;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const token = await getOrCreateToken(id);
        return NextResponse.json({ token });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'Vehicle not found') {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        console.error('Error getting QR token:', e);
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
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    if (!canAccessAdminPanel(session.user.roles || [])) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;

    const newToken = crypto.randomUUID();
    const res = await db.execute({
        sql: `UPDATE Vehicle SET qrToken = ? WHERE id = ?`,
        args: [newToken, id],
    });

    if (res.rowsAffected === 0) {
        return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

    return NextResponse.json({ token: newToken });
}
