/**
 * Un document lié à un véhicule.
 *
 *   GET    — lecture `inline`, ou téléchargement avec `?download=1` — même UL
 *   DELETE — retrait — admin de l'UL
 *
 * ⚠️ `[id]` est le NOM du véhicule, comme pour `/api/vehicles/[id]`.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { canManageVehicles, isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { vehicleDocumentResponse } from '@/lib/vehicleDocuments/server';
import { withAudit } from '@/lib/audit/log';

// Lecture R2 et Buffer : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

async function findVehicleByName(name: string) {
    const res = await db.execute({
        sql: `SELECT id, ulId FROM Vehicle WHERE name = ?`,
        args: [name],
    });
    return res.rows[0] ?? null;
}

export async function GET(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        // Aligné sur /api/qr/[token]/documents : un compte inactif ne lit pas les documents.
        if (isQrBlocked(session.user.roles || [])) {
            return forbiddenResponse('Compte inactif');
        }

        const { id, documentId } = await params;
        const vehicle = await findVehicleByName(id);

        // Même cloisonnement que GET /api/vehicles/[id] : un véhicule d'une autre
        // UL est indiscernable d'un véhicule inexistant.
        if (!vehicle || isOutsideUl(session.user.roles || [], session.user.ulId, vehicle.ulId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const download = new URL(request.url).searchParams.get('download') === '1';
        return await vehicleDocumentResponse(vehicle.id as string, documentId, download);
    } catch (error: unknown) {
        console.error('[GET /api/vehicles/[id]/documents/[documentId]]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors de la récupération du document.' }, { status: 500 });
    }
}

async function deleteHandler(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (!canManageVehicles(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const { id, documentId } = await params;
        const vehicle = await findVehicleByName(id);
        if (!vehicle) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        if (isOutsideUl(session.user.roles || [], session.user.ulId, vehicle.ulId)) {
            return forbiddenResponse();
        }

        const vehicleId = vehicle.id as string;
        const docRes = await db.execute({
            sql: `SELECT r2Key FROM VehicleDocument WHERE id = ? AND vehicleId = ?`,
            args: [documentId, vehicleId],
        });
        const doc = docRes.rows[0];
        if (!doc) {
            return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
        }
        const key = doc.r2Key as string;

        // Une seule transaction : si la ligne disparaissait sans la remise à NULL des
        // colonnes `guide*` d'un ancien guide repris, une relance de la migration
        // ressusciterait le document.
        await db.batch([
            {
                sql: `DELETE FROM VehicleDocument WHERE id = ? AND vehicleId = ?`,
                args: [documentId, vehicleId],
            },
            {
                sql: `UPDATE Vehicle SET guideR2Key = NULL, guideFileName = NULL, guideSize = NULL, guideUpdatedAt = NULL WHERE id = ? AND guideR2Key = ?`,
                args: [vehicleId, key],
            },
        ], 'write');

        const { deleteObject } = await import('@/lib/r2');
        await deleteObject(key).catch((e: unknown) =>
            console.error(`[vehicle-document] suppression de ${key} impossible :`, getErrorMessage(e)));

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/vehicles/[id]/documents/[documentId]]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors du retrait du document.' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Retrait d'un document lié à un véhicule", entityType: 'vehicle', idParam: 'id' });
