import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

// ── GET /api/inventory/items — catalogue complet ──────────────────────────────

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const res = await db.execute(
            `SELECT id, name, sku, category, unit, notes, createdAt, updatedAt
             FROM "InvItem"
             ORDER BY name ASC`
        );

        const items = res.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            sku: (r.sku as string | null) ?? null,
            category: (r.category as string | null) ?? null,
            unit: (r.unit as string) ?? 'unité',
            notes: (r.notes as string | null) ?? null,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
        }));

        return NextResponse.json({ items });
    } catch (e) {
        console.error('GET /api/inventory/items error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du catalogue' }, { status: 500 });
    }
}

// ── POST /api/inventory/items — créer stock à un emplacement ─────────────────

const createItemSchema = z.object({
    // Catalogue — lookup/create
    itemId: z.string().optional(),
    name: z.string().min(1).optional(),
    sku: z.string().optional(),
    category: z.string().optional(),
    unit: z.string().optional(),
    notes: z.string().optional(),
    // Stock
    locationId: z.string().min(1),
    quantity: z.number().int().min(0).default(0),
    expiryDate: z.string().optional(),
    status: z.enum(['OK', 'HORS_SERVICE', 'MANQUANT']).default('OK'),
    criticalThreshold: z.number().int().min(0).optional(),
});

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
        const data = createItemSchema.parse(body);

        if (!data.itemId && !data.name) {
            return NextResponse.json(
                { error: 'itemId ou name est requis pour identifier l\'article du catalogue' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();
        let resolvedItemId: string;

        if (data.itemId) {
            // Cherche l'article catalogue existant
            const existing = await db.execute({
                sql: `SELECT id FROM "InvItem" WHERE id = ?`,
                args: [data.itemId],
            });
            if (existing.rows.length === 0) {
                return NextResponse.json({ error: 'Article catalogue non trouvé' }, { status: 404 });
            }
            resolvedItemId = data.itemId;
        } else {
            // name est garanti non-undefined ici (vérifié ci-dessus)
            const itemName = data.name!;
            // Cherche par nom (insensible à la casse) ou SKU
            let found: string | null = null;

            const byName = await db.execute({
                sql: `SELECT id FROM "InvItem" WHERE lower(name) = lower(?)`,
                args: [itemName],
            });
            if (byName.rows.length > 0) {
                found = byName.rows[0].id as string;
            } else if (data.sku) {
                const bySku = await db.execute({
                    sql: `SELECT id FROM "InvItem" WHERE sku = ?`,
                    args: [data.sku],
                });
                if (bySku.rows.length > 0) found = bySku.rows[0].id as string;
            }

            if (found) {
                resolvedItemId = found;
            } else {
                // Crée un nouvel article catalogue
                resolvedItemId = crypto.randomUUID();
                await db.execute({
                    sql: `INSERT INTO "InvItem" (id, name, sku, category, unit, notes, createdAt, updatedAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        resolvedItemId,
                        itemName,
                        data.sku ?? null,
                        data.category ?? null,
                        data.unit ?? 'unité',
                        data.notes ?? null,
                        now,
                        now,
                    ],
                });
            }
        }

        // Vérifie conflit UNIQUE(locationId, itemId)
        const conflict = await db.execute({
            sql: `SELECT id FROM "InvStock" WHERE locationId = ? AND itemId = ?`,
            args: [data.locationId, resolvedItemId],
        });
        if (conflict.rows.length > 0) {
            return NextResponse.json(
                { error: 'Un stock pour cet article existe déjà à cet emplacement' },
                { status: 409 }
            );
        }

        const stockId = crypto.randomUUID();
        await db.execute({
            sql: `INSERT INTO "InvStock"
                    (id, locationId, itemId, quantity, expiryDate, status, criticalThreshold, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                stockId,
                data.locationId,
                resolvedItemId,
                data.quantity,
                data.expiryDate ?? null,
                data.status,
                data.criticalThreshold ?? null,
                now,
                now,
            ],
        });

        // Retourne le stock créé avec les détails
        const stockRes = await db.execute({
            sql: `SELECT s.*,
                         loc.name AS locationName, loc.type AS locationType,
                         loc.vehicleId, loc.parentId,
                         v.name AS vehicleName,
                         i.name AS itemName, i.sku, i.category, i.unit
                  FROM "InvStock" s
                  JOIN "InvLocation" loc ON loc.id = s.locationId
                  LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
                  JOIN "InvItem" i ON i.id = s.itemId
                  WHERE s.id = ?`,
            args: [stockId],
        });

        const r = stockRes.rows[0];
        return NextResponse.json({
            id: r.id as string,
            locationId: r.locationId as string,
            locationName: r.locationName as string,
            locationType: r.locationType as string,
            vehicleId: (r.vehicleId as string | null) ?? null,
            vehicleName: (r.vehicleName as string | null) ?? null,
            parentId: (r.parentId as string | null) ?? null,
            itemId: r.itemId as string,
            itemName: r.itemName as string,
            sku: (r.sku as string | null) ?? null,
            category: (r.category as string | null) ?? null,
            unit: r.unit as string,
            quantity: Number(r.quantity),
            expiryDate: (r.expiryDate as string | null) ?? null,
            status: r.status as string,
            criticalThreshold: r.criticalThreshold != null ? Number(r.criticalThreshold) : null,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
        }, { status: 201 });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/items error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création de l\'article' }, { status: 500 });
    }
}
