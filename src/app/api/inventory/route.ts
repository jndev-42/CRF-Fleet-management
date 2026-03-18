import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') ?? '';
        const location = searchParams.get('location') ?? 'all';

        // ── KPIs ──────────────────────────────────────────────────

        const expiringSoonRes = await db.execute(
            `SELECT COUNT(*) as count FROM "InvStock"
             WHERE expiryDate IS NOT NULL
               AND date(expiryDate) <= date('now', '+30 days')
               AND status = 'OK'`
        );
        const expiringSoon = Number(expiringSoonRes.rows[0].count ?? 0);

        const horsServiceRes = await db.execute(
            `SELECT COUNT(*) as count FROM "InvStock" WHERE status = 'HORS_SERVICE'`
        );
        const horsService = Number(horsServiceRes.rows[0].count ?? 0);

        const pharmaAlertsRes = await db.execute(
            `SELECT COUNT(*) as count FROM "InvStock" s
             JOIN "InvLocation" loc ON loc.id = s.locationId
             WHERE loc.type = 'PHARMA_TAMPON'
               AND s.criticalThreshold IS NOT NULL
               AND s.quantity < s.criticalThreshold`
        );
        const pharmaAlertsCount = Number(pharmaAlertsRes.rows[0].count ?? 0);

        // fleetCompleteness : ratio stock >= targetQty / total entries de modèles sur sacs
        const completenessRes = await db.execute(
            `SELECT
               (SELECT COUNT(*) FROM "InvBagTemplateItem" bti
                JOIN "InvLocation" loc ON loc.templateId = bti.templateId
                WHERE loc.type = 'SAC') AS totalTemplates,
               (SELECT COUNT(*) FROM "InvBagTemplateItem" bti
                JOIN "InvLocation" loc ON loc.templateId = bti.templateId
                JOIN "InvStock" s ON s.locationId = loc.id AND s.itemId = bti.itemId
                WHERE loc.type = 'SAC' AND s.quantity >= bti.targetQty) AS okTemplates`
        );
        const totalTemplates = Number(completenessRes.rows[0].totalTemplates ?? 0);
        const okTemplates = Number(completenessRes.rows[0].okTemplates ?? 0);
        const fleetCompleteness = totalTemplates > 0
            ? Math.round((okTemplates / totalTemplates) * 100)
            : 0;

        // ── Stock query ────────────────────────────────────────────

        const stockArgs: (string | number | null)[] = [];
        const whereConditions: string[] = [];

        if (search) {
            whereConditions.push(`(i.name LIKE ? OR i.sku LIKE ?)`);
            stockArgs.push(`%${search}%`, `%${search}%`);
        }

        if (location === 'STOCK_CENTRAL') {
            whereConditions.push(`loc.type = 'STOCK_CENTRAL'`);
        } else if (location === 'PHARMA_TAMPON') {
            whereConditions.push(`loc.type IN ('PHARMA_TAMPON', 'SAC') AND (loc.type = 'PHARMA_TAMPON' OR loc.parentId IN (SELECT id FROM "InvLocation" WHERE type = 'PHARMA_TAMPON'))`);
        } else if (location?.startsWith('vehicle:')) {
            const vehicleId = location.replace('vehicle:', '');
            whereConditions.push(`loc.vehicleId = ?`);
            stockArgs.push(vehicleId);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
                  ${whereClause}
                  ORDER BY i.name ASC`,
            args: stockArgs,
        });

        const stock = stockRes.rows.map(r => ({
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
        }));

        // ── Groupes query ──────────────────────────────────────────

        const groupesRes = await db.execute(
            `SELECT g.id, g.name, g.description, g.createdAt, g.updatedAt
             FROM "InvGroupe" g
             ORDER BY g.name ASC`
        );

        const groupes = await Promise.all(groupesRes.rows.map(async r => {
            const sacsRes = await db.execute({
                sql: `SELECT loc.* FROM "InvGroupeMember" gm
                      JOIN "InvLocation" loc ON loc.id = gm.locationId
                      WHERE gm.groupeId = ?
                      ORDER BY loc.name ASC`,
                args: [r.id as string],
            });

            return {
                id: r.id as string,
                name: r.name as string,
                description: (r.description as string | null) ?? null,
                createdAt: r.createdAt as string,
                updatedAt: r.updatedAt as string,
                sacs: sacsRes.rows.map(s => ({
                    id: s.id as string,
                    type: s.type as string,
                    name: s.name as string,
                    vehicleId: (s.vehicleId as string | null) ?? null,
                    parentId: (s.parentId as string | null) ?? null,
                    isSealed: s.isSealed === 1,
                    createdAt: s.createdAt as string,
                    updatedAt: s.updatedAt as string,
                })),
            };
        }));

        // ── Sacs avec stock ────────────────────────────────────────

        const sacsRes = await db.execute(
            `SELECT loc.*, v.name AS vehicleName
             FROM "InvLocation" loc
             LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
             WHERE loc.type = 'SAC'
             ORDER BY loc.name ASC`
        );

        const sacsWithStock = await Promise.all(sacsRes.rows.map(async sacRow => {
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
                args: [sacRow.id as string],
            });

            const templateId = (sacRow.templateId as string | null) ?? null;
            let templateEntries: Array<{ itemId: string; itemName: string; unit: string; targetQty: number }> = [];

            if (templateId) {
                const tplEntriesRes = await db.execute({
                    sql: `SELECT bti.itemId, bti.targetQty, i.name AS itemName, i.unit
                          FROM "InvBagTemplateItem" bti
                          JOIN "InvItem" i ON i.id = bti.itemId
                          WHERE bti.templateId = ?
                          ORDER BY i.name ASC`,
                    args: [templateId],
                });
                templateEntries = tplEntriesRes.rows.map(r => ({
                    itemId: r.itemId as string,
                    itemName: r.itemName as string,
                    unit: r.unit as string,
                    targetQty: Number(r.targetQty),
                }));
            }

            return {
                id: sacRow.id as string,
                type: sacRow.type as string,
                name: sacRow.name as string,
                vehicleId: (sacRow.vehicleId as string | null) ?? null,
                vehicleName: (sacRow.vehicleName as string | null) ?? null,
                parentId: (sacRow.parentId as string | null) ?? null,
                isSealed: sacRow.isSealed === 1,
                templateId,
                templateEntries,
                createdAt: sacRow.createdAt as string,
                updatedAt: sacRow.updatedAt as string,
                stock: sacStockRes.rows.map(r => ({
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
                })),
            };
        }));

        // ── Alertes Pharmacie Tampon ───────────────────────────────

        const pharmaAlertItemsRes = await db.execute(
            `SELECT s.*,
                    loc.name AS locationName, loc.type AS locationType, loc.vehicleId, loc.parentId,
                    v.name AS vehicleName,
                    i.name AS itemName, i.sku, i.category, i.unit
             FROM "InvStock" s
             JOIN "InvLocation" loc ON loc.id = s.locationId
             LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
             JOIN "InvItem" i ON i.id = s.itemId
             WHERE loc.type = 'PHARMA_TAMPON'
               AND s.criticalThreshold IS NOT NULL
               AND s.quantity < s.criticalThreshold`
        );

        const pharmaAlerts = pharmaAlertItemsRes.rows.map(r => ({
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
        }));

        return NextResponse.json({
            kpis: { expiringSoon, horsService, pharmaAlerts: pharmaAlertsCount, fleetCompleteness },
            stock,
            groupes,
            sacs: sacsWithStock,
            pharmaAlerts,
        });
    } catch (e) {
        console.error('GET /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération de l\'inventaire' }, { status: 500 });
    }
}
