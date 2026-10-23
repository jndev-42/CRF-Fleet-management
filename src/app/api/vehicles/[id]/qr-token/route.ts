import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canSuperviseVehicles } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';

/**
 * GET /api/vehicles/[id]/qr-token
 * Returns (or lazily creates) the QR bypass token for a vehicle.
 * Accessible to all authenticated users of the vehicle's UL (cloisonnement `isOutsideUl` → 404).
 *
 * POST /api/vehicles/[id]/qr-token
 * Same as GET — kept for semantic consistency, also used by QRCodeModal.
 *
 * DELETE /api/vehicles/[id]/qr-token
 * Regenerates the token (invalidates old QR codes). Admin only, same UL.
 */

/** Cloisonnement UL : véhicule inconnu ou d'une autre UL → même 404. */
async function isVehicleHidden(roles: string[], sessionUlId: string | undefined, vehicleId: string): Promise<boolean> {
    const res = await db.execute({ sql: `SELECT ulId FROM Vehicle WHERE id = ?`, args: [vehicleId] });
    return res.rows.length === 0 || isOutsideUl(roles, sessionUlId, res.rows[0].ulId);
}

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
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        if (await isVehicleHidden(session.user.roles || [], session.user.ulId, id)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
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

async function postHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return GET(request, { params });
}

async function deleteHandler(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }
    if (!canSuperviseVehicles(session.user.roles || [])) {
        return forbiddenResponse();
    }

    const { id } = await params;

    if (await isVehicleHidden(session.user.roles || [], session.user.ulId, id)) {
        return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

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

export const POST = withAudit(postHandler, { action: "Génération du QR code d'un véhicule", entityType: 'vehicle' });
export const DELETE = withAudit(deleteHandler, { action: "Régénération du QR code d'un véhicule", entityType: 'vehicle' });
