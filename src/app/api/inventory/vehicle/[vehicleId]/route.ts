import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

// ── GET /api/inventory/vehicle/[vehicleId] ────────────────────────────────────

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ vehicleId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { vehicleId } = await params;

        // Lieu VEHICLE du véhicule
        const vehicleLocRes = await db.execute({
            sql: `SELECT id, name FROM "InvLocation" WHERE vehicleId = ? AND type = 'VEHICLE'`,
            args: [vehicleId],
        });

        if (vehicleLocRes.rows.length === 0) {
            return NextResponse.json({ vehicleLocation: null, sacs: [], directStock: [] });
        }

        const vehicleLocation = {
            id: vehicleLocRes.rows[0].id as string,
            name: vehicleLocRes.rows[0].name as string,
        };
        const vehicleLocId = vehicleLocation.id;

        // Sacs enfants de ce lieu véhicule
        const sacsRes = await db.execute({
            sql: `SELECT id, name, isSealed, parentId, vehicleId, templateId, createdAt, updatedAt
                  FROM "InvLocation"
                  WHERE parentId = ? AND type = 'SAC'
                  ORDER BY name ASC`,
            args: [vehicleLocId],
        });

        // Stock direct sur le lieu véhicule
        const directStockRes = await db.execute({
            sql: `SELECT s.*,
                         loc.name AS locationName, loc.type AS locationType, loc.vehicleId AS locVehicleId, loc.parentId,
                         v.name AS vehicleName,
                         i.name AS itemName, i.sku, i.category, i.unit
                  FROM "InvStock" s
                  JOIN "InvLocation" loc ON loc.id = s.locationId
                  LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
                  JOIN "InvItem" i ON i.id = s.itemId
                  WHERE s.locationId = ?
                  ORDER BY i.name ASC`,
            args: [vehicleLocId],
        });

        function mapStock(r: Record<string, unknown>) {
            return {
                id: r.id as string,
                locationId: r.locationId as string,
                locationName: r.locationName as string,
                locationType: r.locationType as string,
                vehicleId: (r.locVehicleId as string | null) ?? null,
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
            };
        }

        const directStock = directStockRes.rows.map(r => mapStock(r as Record<string, unknown>));

        // Pour chaque sac : stock + template
        const sacs = await Promise.all(sacsRes.rows.map(async sacRow => {
            const sacId = sacRow.id as string;

            const sacStockRes = await db.execute({
                sql: `SELECT s.*,
                             loc.name AS locationName, loc.type AS locationType, loc.vehicleId AS locVehicleId, loc.parentId,
                             v.name AS vehicleName,
                             i.name AS itemName, i.sku, i.category, i.unit
                      FROM "InvStock" s
                      JOIN "InvLocation" loc ON loc.id = s.locationId
                      LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
                      JOIN "InvItem" i ON i.id = s.itemId
                      WHERE s.locationId = ?
                      ORDER BY i.name ASC`,
                args: [sacId],
            });

            const templateId = (sacRow.templateId as string | null) ?? null;
            let template: Array<{ itemId: string; targetQty: number; itemName: string; unit: string }> = [];

            if (templateId) {
                const templateRes = await db.execute({
                    sql: `SELECT bti.itemId, bti.targetQty, i.name AS itemName, i.unit
                          FROM "InvBagTemplateItem" bti
                          JOIN "InvItem" i ON i.id = bti.itemId
                          WHERE bti.templateId = ?
                          ORDER BY i.name ASC`,
                    args: [templateId],
                });
                template = templateRes.rows.map(r => ({
                    itemId: r.itemId as string,
                    targetQty: Number(r.targetQty),
                    itemName: r.itemName as string,
                    unit: r.unit as string,
                }));
            }

            return {
                id: sacRow.id as string,
                name: sacRow.name as string,
                isSealed: sacRow.isSealed === 1,
                parentId: (sacRow.parentId as string | null) ?? null,
                vehicleId: (sacRow.vehicleId as string | null) ?? null,
                templateId,
                createdAt: sacRow.createdAt as string,
                updatedAt: sacRow.updatedAt as string,
                stock: sacStockRes.rows.map(r => mapStock(r as Record<string, unknown>)),
                template,
            };
        }));

        return NextResponse.json({ vehicleLocation, sacs, directStock });
    } catch (e) {
        console.error('GET /api/inventory/vehicle/[vehicleId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération de l\'inventaire véhicule' }, { status: 500 });
    }
}
