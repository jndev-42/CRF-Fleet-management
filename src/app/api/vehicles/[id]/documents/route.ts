/**
 * Documents liés à un véhicule — dépôt.
 *
 *   POST — ajoute UN PDF (multipart, champ `file`) — admin de l'UL
 *
 * Un fichier par appel : chaque requête reste sous la limite de corps de Vercel
 * (4 Mo), et le total par véhicule n'est pas limité. Lecture et retrait vivent
 * sous `documents/[documentId]`.
 *
 * ⚠️ `[id]` est le NOM du véhicule, comme pour `/api/vehicles/[id]`.
 *
 * Le binaire vit dans R2 (préfixe `vehicle-guides/`), jamais en base. Ordre
 * d'écriture : R2 puis base ; en cas d'échec base, l'objet est nettoyé.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { canManageVehicles } from '@/lib/roles';
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
import { withAudit } from '@/lib/audit/log';

// Lecture multipart, Buffer et R2 : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

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
        const vehicleRes = await db.execute({
            sql: `SELECT id, ulId FROM Vehicle WHERE name = ?`,
            args: [id],
        });
        const vehicle = vehicleRes.rows[0];
        if (!vehicle) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
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
        const documentId = crypto.randomUUID();
        const key = buildVehicleGuideKey(vehicleId, newAttemptId());
        const fileName = sanitizeGuideFileName(file.name);
        const createdAt = new Date().toISOString();

        await putObject(key, body, 'application/pdf');

        try {
            await db.execute({
                sql: `INSERT INTO VehicleDocument (id, vehicleId, r2Key, fileName, size, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [documentId, vehicleId, key, fileName, body.length, createdAt],
            });
        } catch (error: unknown) {
            // La base n'a pas enregistré : le nouvel objet n'est référencé nulle part.
            await deleteObject(key).catch((e: unknown) =>
                console.error(`[vehicle-document] nettoyage de ${key} impossible :`, getErrorMessage(e)));
            throw error;
        }

        return NextResponse.json({
            success: true,
            document: { id: documentId, fileName, size: body.length, createdAt },
        }, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/vehicles/[id]/documents]', getErrorMessage(error));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement du document." }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'un document lié à un véhicule", entityType: 'vehicle' });
