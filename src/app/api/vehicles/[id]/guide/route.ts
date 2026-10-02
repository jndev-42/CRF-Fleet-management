/**
 * Guide de vérification PDF d'un véhicule.
 *
 *   POST   — dépôt ou remplacement (multipart, champ `file`) — admin de l'UL
 *   GET    — lecture `inline`, ou téléchargement avec `?download=1` — même UL
 *   DELETE — retrait — admin de l'UL
 *
 * ⚠️ `[id]` est le NOM du véhicule, comme pour `/api/vehicles/[id]`.
 *
 * Le binaire vit dans R2 (préfixe `vehicle-guides/`), jamais en base : la base
 * ne porte que la clé et les métadonnées. Les clés sont versionnées — un
 * remplacement écrit un nouvel objet, bascule la base, puis supprime l'ancien.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isAdminOrAbove, isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import {
    MAX_GUIDE_SIZE,
    GUIDE_NOT_PDF_ERROR,
    GUIDE_TOO_LARGE_ERROR,
    hasPdfSignature,
    looksLikePdf,
    sanitizeGuideFileName,
} from '@/lib/vehicleGuide';
import { vehicleGuideResponse } from '@/lib/vehicleGuideResponse';
import { withAudit } from '@/lib/audit/log';

// Lecture multipart, Buffer et R2 : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

const NOT_FOUND = { error: 'Véhicule non trouvé' };

async function findVehicleByName(name: string) {
    const res = await db.execute({
        sql: `SELECT id, ulId, guideR2Key, guideFileName FROM Vehicle WHERE name = ?`,
        args: [name],
    });
    return res.rows[0] ?? null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        // Aligné sur /api/qr/[token]/guide : un compte inactif ne lit pas le guide.
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

        const download = new URL(request.url).searchParams.get('download') === '1';
        return await vehicleGuideResponse(vehicle, download);
    } catch (error: unknown) {
        console.error('[GET /api/vehicles/[id]/guide]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors de la récupération du guide.' }, { status: 500 });
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
        if (!isAdminOrAbove(session.user.roles || [])) {
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
            return NextResponse.json({ error: 'Requête invalide : un fichier PDF est attendu.' }, { status: 400 });
        }

        const file = formData.get('file');
        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
        }
        if (file.size > MAX_GUIDE_SIZE) {
            return NextResponse.json({ error: GUIDE_TOO_LARGE_ERROR }, { status: 413 });
        }
        if (!looksLikePdf(file)) {
            return NextResponse.json({ error: GUIDE_NOT_PDF_ERROR }, { status: 400 });
        }

        const body = Buffer.from(await file.arrayBuffer());
        // Le type et l'extension se falsifient trivialement : seuls les octets font foi.
        if (!hasPdfSignature(body)) {
            return NextResponse.json({ error: GUIDE_NOT_PDF_ERROR }, { status: 400 });
        }

        const { buildVehicleGuideKey, newAttemptId, putObject, deleteObject } = await import('@/lib/r2');

        const vehicleId = vehicle.id as string;
        const previousKey = (vehicle.guideR2Key as string | null) || null;
        const key = buildVehicleGuideKey(vehicleId, newAttemptId());
        const fileName = sanitizeGuideFileName(file.name);
        const updatedAt = new Date().toISOString();

        await putObject(key, body, 'application/pdf');

        try {
            await db.execute({
                sql: `UPDATE Vehicle SET guideR2Key = ?, guideFileName = ?, guideSize = ?, guideUpdatedAt = ? WHERE id = ?`,
                args: [key, fileName, body.length, updatedAt, vehicleId],
            });
        } catch (error: unknown) {
            // La base n'a pas basculé : le nouvel objet n'est référencé nulle part.
            await deleteObject(key).catch((e: unknown) =>
                console.error(`[vehicle-guide] nettoyage de ${key} impossible :`, getErrorMessage(e)));
            throw error;
        }

        // Après la bascule seulement : un échec ici laisse un orphelin inoffensif,
        // jamais un véhicule pointant vers un objet supprimé.
        if (previousKey && previousKey !== key) {
            await deleteObject(previousKey).catch((e: unknown) =>
                console.error(`[vehicle-guide] suppression de l'ancien guide ${previousKey} impossible :`, getErrorMessage(e)));
        }

        return NextResponse.json({
            success: true,
            guide: { fileName, size: body.length, updatedAt },
        });
    } catch (error: unknown) {
        console.error('[POST /api/vehicles/[id]/guide]', getErrorMessage(error));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement du guide." }, { status: 500 });
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
        if (!isAdminOrAbove(session.user.roles || [])) {
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

        const previousKey = (vehicle.guideR2Key as string | null) || null;
        // Retrait idempotent : rien à faire si le véhicule n'a pas de guide.
        if (!previousKey) {
            return NextResponse.json({ success: true });
        }

        await db.execute({
            sql: `UPDATE Vehicle SET guideR2Key = NULL, guideFileName = NULL, guideSize = NULL, guideUpdatedAt = NULL WHERE id = ?`,
            args: [vehicle.id],
        });

        const { deleteObject } = await import('@/lib/r2');
        await deleteObject(previousKey).catch((e: unknown) =>
            console.error(`[vehicle-guide] suppression du guide ${previousKey} impossible :`, getErrorMessage(e)));

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/vehicles/[id]/guide]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors du retrait du guide.' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Dépôt du guide de vérification d'un véhicule", entityType: 'vehicle' });
export const DELETE = withAudit(deleteHandler, { action: "Retrait du guide de vérification d'un véhicule", entityType: 'vehicle' });
