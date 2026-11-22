import { db } from '@/lib/db';
import type { DossierStatus } from './dossiers';

/**
 * Dossier « Nouveau » créé automatiquement quand une déclaration d'incident (accident,
 * flash) est envoyée. Un seul dossier par déclaration : l'index unique partiel
 * `idx_FleetDossier_source` sur (`sourceType`, `sourceId`) fait de l'insertion un
 * no-op à la deuxième tentative.
 *
 * **Server only.** Jamais appelé depuis le carnet de bord (prise, retour).
 */

export const INCIDENT_SOURCE_TYPE = 'INCIDENT_REPORT';

const INCIDENT_TYPE_TITLES: Record<string, string> = {
    ACCIDENT: 'Accident',
    FLASH: 'Avis de contravention (flash)',
};

export interface IncidentDossierSource {
    type: string | null;
    vehicleName: string;
    declarantName: string | null;
    occurredAt: string | null;
    location: string | null;
    description: string | null;
}

/** « Accident — VL186 » / « Avis de contravention (flash) — VL186 ». */
export function incidentDossierTitle(type: string | null, vehicleName: string): string {
    return `${INCIDENT_TYPE_TITLES[type ?? ''] ?? 'Incident'} — ${vehicleName}`;
}

/** Date lisible (Europe/Paris) d'un incident ; la valeur brute si elle n'est pas une date. */
function formatOccurredAt(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Description générée : déclarant, date et lieu de l'incident, description saisie. */
export function incidentDossierDescription(src: IncidentDossierSource): string {
    const lines: string[] = [];
    lines.push(`Déclaré par : ${src.declarantName || 'inconnu'}`);
    if (src.occurredAt) lines.push(`Date de l'incident : ${formatOccurredAt(src.occurredAt)}`);
    if (src.location) lines.push(`Lieu : ${src.location}`);
    if (src.description) lines.push('', src.description);
    return lines.join('\n');
}

/**
 * Crée le dossier de la déclaration `reportId` (UL et véhicule de la déclaration).
 * Renvoie l'id du dossier créé, ou `null` s'il existait déjà ou si la déclaration (ou
 * son véhicule) est introuvable. Ne lève jamais : une erreur est journalisée, la
 * déclaration reste enregistrée.
 */
export async function createIncidentDossier(reportId: string): Promise<string | null> {
    try {
        const res = await db.execute({
            sql: `SELECT ir.id, ir.type, ir.vehicleId, ir.occurredAt, ir.location, ir.description, ir.userId,
                         v.name AS vehicleName, v.ulId AS vehicleUlId,
                         u.name AS userName, u.email AS userEmail
                  FROM "IncidentReport" ir
                  LEFT JOIN "Vehicle" v ON v.id = ir.vehicleId
                  LEFT JOIN "User" u ON u.id = ir.userId
                  WHERE ir.id = ?`,
            args: [reportId],
        });
        const r = res.rows[0];
        if (!r || !r.vehicleName || !r.vehicleUlId) return null;

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const status: DossierStatus = 'NEW';
        const vehicleId = String(r.vehicleId);
        const title = incidentDossierTitle((r.type as string | null) ?? null, String(r.vehicleName));
        const description = incidentDossierDescription({
            type: (r.type as string | null) ?? null,
            vehicleName: String(r.vehicleName),
            declarantName: (r.userName as string | null) || (r.userEmail as string | null) || null,
            occurredAt: (r.occurredAt as string | null) ?? null,
            location: (r.location as string | null) ?? null,
            description: (r.description as string | null) ?? null,
        });

        const results = await db.batch([
            {
                sql: `INSERT INTO "FleetDossier"
                        (id, ulId, vehicleId, title, description, status, pinned, createdBy, createdAt, updatedAt, closedAt, closeReason, sourceType, sourceId)
                      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, ?, ?)
                      ON CONFLICT ("sourceType", "sourceId") WHERE "sourceId" IS NOT NULL DO NOTHING`,
                args: [id, String(r.vehicleUlId), vehicleId, title, description, status, (r.userId as string | null) ?? null, now, now, INCIDENT_SOURCE_TYPE, reportId],
            },
            {
                // Seulement si le dossier vient d'être créé (l'INSERT n'a rien fait sinon).
                sql: `INSERT INTO "FleetDossierVehicle" (dossierId, vehicleId, position)
                      SELECT ?, ?, 0 WHERE EXISTS (SELECT 1 FROM "FleetDossier" WHERE id = ?)`,
                args: [id, vehicleId, id],
            },
        ], 'write');
        return results[0].rowsAffected > 0 ? id : null;
    } catch (e: unknown) {
        console.error('createIncidentDossier error:', e instanceof Error ? e.message : String(e));
        return null;
    }
}
