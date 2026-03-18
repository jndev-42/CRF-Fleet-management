import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const createTemplateSchema = z.object({
    name: z.string().min(1),
    entries: z.array(z.object({
        itemId: z.string().min(1),
        targetQty: z.number().int().min(1),
    })).default([]),
});

// ── GET /api/inventory/bag-templates — liste tous les modèles ─────────────────

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const res = await db.execute(
            `SELECT bt.id, bt.name, bt.createdAt,
                    COUNT(bti.id) AS itemCount
             FROM "InvBagTemplate" bt
             LEFT JOIN "InvBagTemplateItem" bti ON bti.templateId = bt.id
             GROUP BY bt.id, bt.name, bt.createdAt
             ORDER BY bt.name ASC`
        );

        const templates = res.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            itemCount: Number(r.itemCount ?? 0),
            createdAt: r.createdAt as string,
        }));

        return NextResponse.json({ templates });
    } catch (e) {
        console.error('GET /api/inventory/bag-templates error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération des modèles' }, { status: 500 });
    }
}

// ── POST /api/inventory/bag-templates — créer un modèle ──────────────────────

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé — ADMIN requis' }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;
        const data = createTemplateSchema.parse(body);

        // Vérifie que le nom est unique
        const existing = await db.execute({
            sql: `SELECT id FROM "InvBagTemplate" WHERE name = ?`,
            args: [data.name],
        });
        if (existing.rows.length > 0) {
            return NextResponse.json({ error: 'Un modèle avec ce nom existe déjà' }, { status: 409 });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO "InvBagTemplate" (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)`,
            args: [id, data.name, now, now],
        });

        for (const entry of data.entries) {
            await db.execute({
                sql: `INSERT INTO "InvBagTemplateItem" (id, templateId, itemId, targetQty) VALUES (?, ?, ?, ?)`,
                args: [crypto.randomUUID(), id, entry.itemId, entry.targetQty],
            });
        }

        return NextResponse.json({ id, name: data.name, itemCount: data.entries.length, createdAt: now }, { status: 201 });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/bag-templates error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création du modèle' }, { status: 500 });
    }
}
