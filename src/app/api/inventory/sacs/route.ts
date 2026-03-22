import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const createSacSchema = z.object({
    name: z.string().min(1),
    parentLocationId: z.string().min(1),
    isSealed: z.boolean().default(false),
    templateId: z.string().optional(),
});

// ── POST /api/inventory/sacs — créer un sac ───────────────────────────────────

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;
        const data = createSacSchema.parse(body);

        // Vérifie que le parent est de type VEHICLE ou PHARMA_TAMPON
        const parentRes = await db.execute({
            sql: `SELECT id, type, vehicleId FROM "InvLocation" WHERE id = ?`,
            args: [data.parentLocationId],
        });
        if (parentRes.rows.length === 0) {
            return NextResponse.json({ error: 'Emplacement parent non trouvé' }, { status: 404 });
        }

        const parent = parentRes.rows[0];
        const parentType = parent.type as string;
        if (parentType !== 'VEHICLE' && parentType !== 'PHARMA_TAMPON') {
            return NextResponse.json(
                { error: 'Le parent d\'un sac doit être de type VEHICLE ou PHARMA_TAMPON' },
                { status: 400 }
            );
        }

        // Vérifie que le template existe si fourni
        let templateId: string | null = null;
        if (data.templateId) {
            const tplRes = await db.execute({
                sql: `SELECT id FROM "InvBagTemplate" WHERE id = ?`,
                args: [data.templateId],
            });
            if (tplRes.rows.length === 0) {
                return NextResponse.json({ error: 'Modèle de sac non trouvé' }, { status: 404 });
            }
            templateId = data.templateId;
        }

        const vehicleId = (parent.vehicleId as string | null) ?? null;
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO "InvLocation" (id, type, name, vehicleId, parentId, isSealed, templateId, createdAt, updatedAt)
                  VALUES (?, 'SAC', ?, ?, ?, ?, ?, ?, ?)`,
            args: [id, data.name, vehicleId, data.parentLocationId, data.isSealed ? 1 : 0, templateId, now, now],
        });

        return NextResponse.json({
            id,
            type: 'SAC',
            name: data.name,
            vehicleId,
            parentId: data.parentLocationId,
            isSealed: data.isSealed,
            templateId,
            createdAt: now,
            updatedAt: now,
        }, { status: 201 });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/sacs error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création du sac' }, { status: 500 });
    }
}
