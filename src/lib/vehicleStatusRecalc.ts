import { db } from '@/lib/db';

/**
 * Statut effectif dérivé de la présence d'une maintenance active.
 * Pure — testable sans DB.
 *
 * La maintenance est un **flag parallèle** : elle ne prend jamais le pas sur `IN_USE`,
 * un véhicule physiquement dehors reste `IN_USE` même en maintenance.
 */
export function computeEffectiveStatus(currentStatus: string, hasActiveMaintenance: boolean): string {
    const upper = String(currentStatus || '').toUpperCase();
    if (hasActiveMaintenance && upper !== 'IN_USE') return 'MAINTENANCE';
    if (!hasActiveMaintenance && upper === 'MAINTENANCE') return 'AVAILABLE';
    return currentStatus;
}

/**
 * Autorité unique de convergence maintenance ↔ `Vehicle.status`.
 * Appelée par `GET /api/vehicles/[id]` et par tout mutateur de `VehicleMaintenance`.
 * Retourne le statut effectif (déjà persisté s'il a changé).
 *
 * `known` permet à `GET` de passer ce qu'il a déjà lu (aucune requête en double sur la
 * route chaude) ; `PATCH`/`DELETE` n'en passent pas et la fonction fait ses deux `SELECT`.
 */
export async function recalcVehicleStatus(
    vehicleId: string,
    known?: { currentStatus?: string; hasActiveMaintenance?: boolean },
    now: Date = new Date(),
): Promise<string> {
    let currentStatus = known?.currentStatus;
    if (currentStatus === undefined) {
        const statusResult = await db.execute({
            sql: `SELECT status FROM "Vehicle" WHERE id = ?`,
            args: [vehicleId],
        });
        // Véhicule introuvable : rien à recalculer, rien à persister.
        if (statusResult.rows.length === 0) return '';
        currentStatus = statusResult.rows[0].status as string;
    }

    let hasActiveMaintenance = known?.hasActiveMaintenance;
    if (hasActiveMaintenance === undefined) {
        // Prédicat « maintenance active » — copie de `src/app/api/vehicles/[id]/route.ts:88-96`
        // (tolérance ISO / `YYYY-MM-DD`), pour rester en phase avec la définition système.
        const nowISO = now.toISOString();
        const todayDate = nowISO.split('T')[0];
        const maintResult = await db.execute({
            sql: `SELECT 1
                  FROM "VehicleMaintenance"
                  WHERE vehicleId = ?
                    AND (
                      (startDate LIKE '%T%' AND startDate <= ?) OR
                      (startDate NOT LIKE '%T%' AND startDate <= ?)
                    )
                    AND (
                      endDate IS NULL OR
                      (endDate LIKE '%T%' AND endDate > ?) OR
                      (endDate NOT LIKE '%T%' AND endDate >= ?)
                    )
                  LIMIT 1`,
            args: [vehicleId, nowISO, todayDate, nowISO, todayDate],
        });
        hasActiveMaintenance = maintResult.rows.length > 0;
    }

    const effectiveStatus = computeEffectiveStatus(currentStatus, hasActiveMaintenance);

    if (effectiveStatus !== currentStatus) {
        // UPDATE ÉPINGLÉ sur la valeur brute lue (`currentStatus`, pas sa version majuscule).
        // Course fermée : entre la lecture de `status` ci-dessus et cette écriture, un check-in
        // (`trips/[id]/checkin/route.ts:209` → 'AVAILABLE') ou un check-out
        // (`trips/route.ts:179` → 'IN_USE') concurrent a pu changer la colonne. Sans la clause
        // `AND status = ?`, ce recalcul écraserait leur écriture avec un statut calculé sur une
        // photo périmée — un véhicule rendu repasserait 'IN_USE', ou l'inverse.
        // 0 ligne affectée n'est PAS une erreur : le mutateur concurrent a gagné, on retourne le
        // statut effectif calculé et le prochain recalcul convergera.
        await db.execute({
            sql: `UPDATE "Vehicle" SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
            args: [effectiveStatus, vehicleId, currentStatus],
        });
    }

    return effectiveStatus;
}
