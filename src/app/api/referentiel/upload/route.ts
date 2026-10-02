/**
 * POST /api/referentiel/upload — SUPER_ADMIN : prépare l'import d'un référentiel PDF.
 *
 * Crée la ligne `uploading` et renvoie une URL de dépôt signée : le navigateur
 * envoie le PDF DIRECTEMENT à R2. Le fichier ne transite jamais par cette
 * fonction (corps Vercel limité à 4,5 Mo).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { buildReferentielKey, newAttemptId, presignUrl } from '@/lib/r2';
import { sanitizeGuideFileName } from '@/lib/vehicleGuide';
import { UPLOAD_URL_TTL_SEC } from '@/lib/referentiel/repository';
import { withAudit } from '@/lib/audit/log';

export const runtime = 'nodejs';

const uploadSchema = z.object({
    fileName: z.string().trim().min(1, 'Nom de fichier requis').max(255),
}).strict();

async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!isSuperAdmin(session.user.roles || [])) return forbiddenResponse();

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
        }
        const parsed = uploadSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const r2Key = buildReferentielKey(newAttemptId());
        await db.execute({
            sql: `INSERT INTO Referentiel (id, fileName, r2Key, status, createdBy) VALUES (?, ?, ?, 'uploading', ?)`,
            args: [id, sanitizeGuideFileName(parsed.data.fileName), r2Key, session.user.email ?? session.user.id ?? ''],
        });

        const uploadUrl = await presignUrl(r2Key, 'PUT', UPLOAD_URL_TTL_SEC);
        return NextResponse.json({ id, uploadUrl });
    } catch (e: unknown) {
        console.error('POST /api/referentiel/upload error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Import du référentiel secourisme", entityType: 'referentiel' });
