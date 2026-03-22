import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const SECOURISTE_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

// Transfert d'un article entre deux emplacements
const itemTransferSchema = z.object({
    transferType: z.literal('item'),
    itemId: z.string().min(1),
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    qty: z.number().int().min(1),
    note: z.string().optional(),
});

// Déplacement d'un sac entier vers un autre véhicule / Pharmacie Tampon
const sacTransferSchema = z.object({
    transferType: z.literal('sac'),
    sacLocationId: z.string().min(1),
    toParentLocationId: z.string().min(1),
});

const transferSchema = z.discriminatedUnion('transferType', [itemTransferSchema, sacTransferSchema]);

// ── POST /api/inventory/transfer ──────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.some(r => SECOURISTE_ROLES.includes(r))) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;
        const data = transferSchema.parse(body);

        const movedBy = session.user.email ?? 'unknown';
        const now = new Date().toISOString();

        if (data.transferType === 'item') {
            // Vérifie le stock source
            const sourceRes = await db.execute({
                sql: `SELECT s.id, s.quantity, loc.type AS locationType
                      FROM "InvStock" s
                      JOIN "InvLocation" loc ON loc.id = s.locationId
                      WHERE s.locationId = ? AND s.itemId = ?`,
                args: [data.fromLocationId, data.itemId],
            });
            if (sourceRes.rows.length === 0) {
                return NextResponse.json({ error: 'Stock source non trouvé' }, { status: 404 });
            }

            const source = sourceRes.rows[0];
            const sourceQty = Number(source.quantity);
            const sourceType = source.locationType as string;

            // Seul ADMIN peut déplacer depuis STOCK_CENTRAL
            if (sourceType === 'STOCK_CENTRAL' && !roles.includes('ADMIN')) {
                return NextResponse.json(
                    { error: 'Seul un ADMIN peut déplacer des articles depuis le Stock Central' },
                    { status: 403 }
                );
            }

            if (sourceQty < data.qty) {
                return NextResponse.json(
                    { error: `Quantité insuffisante (disponible : ${sourceQty}, demandé : ${data.qty})` },
                    { status: 400 }
                );
            }

            const newSourceQty = sourceQty - data.qty;
            const sourceStockId = source.id as string;

            if (newSourceQty === 0) {
                await db.execute({ sql: `DELETE FROM "InvStock" WHERE id = ?`, args: [sourceStockId] });
            } else {
                await db.execute({
                    sql: `UPDATE "InvStock" SET quantity = ?, updatedAt = ? WHERE id = ?`,
                    args: [newSourceQty, now, sourceStockId],
                });
            }

            // Vérifie si la destination est protégée (STOCK_CENTRAL ou PHARMA_TAMPON)
            const destLocRes = await db.execute({
                sql: `SELECT type FROM "InvLocation" WHERE id = ?`,
                args: [data.toLocationId],
            });
            if (destLocRes.rows.length > 0) {
                const destType = destLocRes.rows[0].type as string;
                if (
                    (destType === 'STOCK_CENTRAL' || destType === 'PHARMA_TAMPON') &&
                    !roles.includes('ADMIN')
                ) {
                    return NextResponse.json(
                        { error: 'Seul un ADMIN peut transférer des articles vers ce type d\'emplacement' },
                        { status: 403 }
                    );
                }
            }

            // Upsert destination
            const destConflict = await db.execute({
                sql: `SELECT id, quantity FROM "InvStock" WHERE locationId = ? AND itemId = ?`,
                args: [data.toLocationId, data.itemId],
            });

            let destStockId: string;
            if (destConflict.rows.length > 0) {
                destStockId = destConflict.rows[0].id as string;
                const newDestQty = Number(destConflict.rows[0].quantity) + data.qty;
                await db.execute({
                    sql: `UPDATE "InvStock" SET quantity = ?, updatedAt = ? WHERE id = ?`,
                    args: [newDestQty, now, destStockId],
                });
            } else {
                destStockId = crypto.randomUUID();
                await db.execute({
                    sql: `INSERT INTO "InvStock" (id, locationId, itemId, quantity, createdAt, updatedAt)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [destStockId, data.toLocationId, data.itemId, data.qty, now, now],
                });
            }

            // Journal de transfert
            await db.execute({
                sql: `INSERT INTO "InvTransfer" (id, itemId, fromLocationId, toLocationId, qty, movedBy, movedAt, note)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), data.itemId, data.fromLocationId, data.toLocationId, data.qty, movedBy, now, data.note ?? null],
            });

            // Retourne le stock destination mis à jour
            const destRes = await db.execute({
                sql: `SELECT s.*,
                             loc.name AS locationName, loc.type AS locationType, loc.vehicleId, loc.parentId,
                             v.name AS vehicleName,
                             i.name AS itemName, i.sku, i.category, i.unit
                      FROM "InvStock" s
                      JOIN "InvLocation" loc ON loc.id = s.locationId
                      LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
                      JOIN "InvItem" i ON i.id = s.itemId
                      WHERE s.id = ?`,
                args: [destStockId],
            });

            const r = destRes.rows[0];
            return NextResponse.json({
                destinationStock: {
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
                },
                sourceQtyRemaining: newSourceQty,
            });
        } else {
            // Transfert de sac entier
            const sacRes = await db.execute({
                sql: `SELECT id, vehicleId, parentId FROM "InvLocation" WHERE id = ? AND type = 'SAC'`,
                args: [data.sacLocationId],
            });
            if (sacRes.rows.length === 0) {
                return NextResponse.json({ error: 'Sac non trouvé' }, { status: 404 });
            }

            const targetParentRes = await db.execute({
                sql: `SELECT id, type, vehicleId FROM "InvLocation" WHERE id = ?`,
                args: [data.toParentLocationId],
            });
            if (targetParentRes.rows.length === 0) {
                return NextResponse.json({ error: 'Emplacement de destination non trouvé' }, { status: 404 });
            }

            const targetParent = targetParentRes.rows[0];
            const newVehicleId = (targetParent.vehicleId as string | null) ?? null;

            // Met à jour le parent du sac
            await db.execute({
                sql: `UPDATE "InvLocation" SET parentId = ?, vehicleId = ?, updatedAt = ? WHERE id = ?`,
                args: [data.toParentLocationId, newVehicleId, now, data.sacLocationId],
            });

            // Logs de transfert pour chaque article du sac
            const sacStocks = await db.execute({
                sql: `SELECT id, itemId, quantity FROM "InvStock" WHERE locationId = ?`,
                args: [data.sacLocationId],
            });
            for (const s of sacStocks.rows) {
                await db.execute({
                    sql: `INSERT INTO "InvTransfer" (id, itemId, fromLocationId, toLocationId, qty, movedBy, movedAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        crypto.randomUUID(),
                        s.itemId as string,
                        data.sacLocationId,
                        data.toParentLocationId,
                        Number(s.quantity),
                        movedBy,
                        now,
                    ],
                });
            }

            const updatedSac = await db.execute({
                sql: `SELECT * FROM "InvLocation" WHERE id = ?`,
                args: [data.sacLocationId],
            });

            const r = updatedSac.rows[0];
            return NextResponse.json({
                id: r.id as string,
                type: r.type as string,
                name: r.name as string,
                vehicleId: (r.vehicleId as string | null) ?? null,
                parentId: (r.parentId as string | null) ?? null,
                isSealed: r.isSealed === 1,
                createdAt: r.createdAt as string,
                updatedAt: r.updatedAt as string,
            });
        }
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/transfer error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors du transfert' }, { status: 500 });
    }
}
