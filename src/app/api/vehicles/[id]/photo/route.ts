/**
 * Photo d'un véhicule.
 *
 *   POST   — dépôt ou remplacement (multipart, champ `file`) — gestionnaire de l'UL
 *   GET    — lecture — même UL
 *   DELETE — retrait — gestionnaire de l'UL
 *
 * ⚠️ `[id]` est le NOM du véhicule, comme pour `/api/vehicles/[id]`.
 *
 * Le binaire vit dans R2 (préfixe `vehicle-photos/`), jamais en base. Les clés sont
 * versionnées : un remplacement écrit un nouvel objet, bascule la base, puis
 * supprime l'ancien.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { canManageVehicles, isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { MAX_PHOTO_SIZE, PHOTO_INVALID_ERROR, PHOTO_TOO_LARGE_ERROR } from '@/lib/vehiclePhoto';
import { normalizeVehiclePhoto, vehiclePhotoResponse } from '@/lib/vehiclePhotoServer';
import { withAudit } from '@/lib/audit/log';

// Lecture multipart, Buffer, sharp et R2 : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

const NOT_FOUND = { error: 'Véhicule non trouvé' };

async function findVehicleByName(name: string) {
    const res = await db.execute({
        sql: `SELECT id, ulId, photoR2Key FROM Vehicle WHERE name = ?`,
        args: [name],
    });
    return res.rows[0] ?? null;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (isQrBlocked(session.user.roles || [])) {
            return forbiddenResponse('Compte inactif');
        }

        const { id } = await params;
        const vehicle = await findVehicleByName(id);

        // Même cloisonnement que GET /api/vehicles/[id] : un véhicule d'une autre
        // UL est indiscernable d'un véhicule inexistant.
        if (!vehicle || isOutsideUl(session.user.roles || [], session.user.ulId, vehicle.ulId)) {
            return NextResponse.json(NOT_FOUND, { status: 404 });
        }

        return await vehiclePhotoResponse(vehicle);
    } catch (error: unknown) {
        console.error('[GET /api/vehicles/[id]/photo]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors de la récupération de la photo.' }, { status: 500 });
    }
}

async function postHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (!canManageVehicles(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const { id } = await params;
        const vehicle = await findVehicleByName(id);
        if (!vehicle) {
            return NextResponse.json(NOT_FOUND, { status: 404 });
        }
        if (isOutsideUl(session.user.roles || [], session.user.ulId, vehicle.ulId)) {
            return forbiddenResponse();
        }

        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json({ error: 'Requête invalide : une photo est attendue.' }, { status: 400 });
        }

        const file = formData.get('file');
        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
        }
        if (file.size > MAX_PHOTO_SIZE) {
            return NextResponse.json({ error: PHOTO_TOO_LARGE_ERROR }, { status: 413 });
        }

        const body = await normalizeVehiclePhoto(Buffer.from(await file.arrayBuffer()));
        if (!body) {
            return NextResponse.json({ error: PHOTO_INVALID_ERROR }, { status: 400 });
        }

        const { buildVehiclePhotoKey, newAttemptId, putObject, deleteObject } = await import('@/lib/r2');

        const vehicleId = vehicle.id as string;
        const previousKey = (vehicle.photoR2Key as string | null) || null;
        const key = buildVehiclePhotoKey(vehicleId, newAttemptId());
        const photoUpdatedAt = new Date().toISOString();

        await putObject(key, body, 'image/jpeg');

        try {
            await db.execute({
                sql: `UPDATE Vehicle SET photoR2Key = ?, photoUpdatedAt = ? WHERE id = ?`,
                args: [key, photoUpdatedAt, vehicleId],
            });
        } catch (error: unknown) {
            // La base n'a pas basculé : le nouvel objet n'est référencé nulle part.
            await deleteObject(key).catch((e: unknown) =>
                console.error(`[vehicle-photo] nettoyage de ${key} impossible :`, getErrorMessage(e)));
            throw error;
        }

        // Après la bascule seulement : un échec ici laisse un orphelin inoffensif,
        // jamais un véhicule pointant vers un objet supprimé.
        if (previousKey && previousKey !== key) {
            await deleteObject(previousKey).catch((e: unknown) =>
                console.error(`[vehicle-photo] suppression de l'ancienne photo ${previousKey} impossible :`, getErrorMessage(e)));
        }

        return NextResponse.json({ success: true, photoUpdatedAt });
    } catch (error: unknown) {
        console.error('[POST /api/vehicles/[id]/photo]', getErrorMessage(error));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement de la photo." }, { status: 500 });
    }
}

async function deleteHandler(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (!canManageVehicles(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const { id } = await params;
        const vehicle = await findVehicleByName(id);
        if (!vehicle) {
            return NextResponse.json(NOT_FOUND, { status: 404 });
        }
        if (isOutsideUl(session.user.roles || [], session.user.ulId, vehicle.ulId)) {
            return forbiddenResponse();
        }

        const previousKey = (vehicle.photoR2Key as string | null) || null;
        // Retrait idempotent : rien à faire si le véhicule n'a pas de photo.
        if (!previousKey) {
            return NextResponse.json({ success: true });
        }

        await db.execute({
            sql: `UPDATE Vehicle SET photoR2Key = NULL, photoUpdatedAt = NULL WHERE id = ?`,
            args: [vehicle.id],
        });

        const { deleteObject } = await import('@/lib/r2');
        await deleteObject(previousKey).catch((e: unknown) =>
            console.error(`[vehicle-photo] suppression de la photo ${previousKey} impossible :`, getErrorMessage(e)));

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/vehicles/[id]/photo]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors du retrait de la photo.' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Dépôt de la photo d'un véhicule", entityType: 'vehicle' });
export const DELETE = withAudit(deleteHandler, { action: "Retrait de la photo d'un véhicule", entityType: 'vehicle' });
