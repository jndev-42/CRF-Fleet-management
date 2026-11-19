import type { Row } from '@libsql/client';
import { db } from '@/lib/db';
import {
    DOSSIER_STATUSES,
    type CreateDossierInput,
    type DossierFilters,
    type DossierItem,
    type DossierStatus,
    type FleetDossier,
    type FleetDossierDetail,
    type UpdateDossierInput,
    type UpdateItemInput,
    type VehicleHistoryEntry,
} from './dossiers';
import { deleteR2Objects, listAttachments, listTasks } from './tasksStore';

/**
 * Accès base des dossiers du suivi technique. Le cloisonnement d'accès (session,
 * rôle, UL du dossier) est décidé par les routes ; ce module exécute dans l'UL qu'on
 * lui passe. Pas de clés étrangères : les suppressions liées sont explicites, en un
 * seul lot `write`.
 */

export interface DossierRow {
    id: string;
    ulId: string;
    vehicleId: string;
    title: string;
    status: DossierStatus;
}

/** Ligne brute d'un dossier (toutes UL) : sert au contrôle d'appartenance. */
export async function getDossierRow(id: string): Promise<DossierRow | null> {
    const res = await db.execute({ sql: `SELECT id, ulId, vehicleId, title, status FROM "FleetDossier" WHERE id = ?`, args: [id] });
    const r = res.rows[0];
    if (!r) return null;
    const status = String(r.status);
    return {
        id: String(r.id), ulId: String(r.ulId), vehicleId: String(r.vehicleId), title: String(r.title),
        status: (DOSSIER_STATUSES as readonly string[]).includes(status) ? status as DossierStatus : 'OPEN',
    };
}

/** Véhicule de l'UL (par identifiant), ou `null`. */
export async function getUlVehicle(ulId: string, vehicleId: string): Promise<{ id: string; name: string } | null> {
    const res = await db.execute({ sql: `SELECT id, name FROM "Vehicle" WHERE id = ? AND ulId = ?`, args: [vehicleId, ulId] });
    const r = res.rows[0];
    return r ? { id: String(r.id), name: String(r.name) } : null;
}

// ── Lecture ──────────────────────────────────────────────────────

const DOSSIER_SELECT = `
    SELECT d.id, d.ulId, d.vehicleId, d.title, d.description, d.status, d.pinned, d.createdAt, d.updatedAt, d.closedAt,
           v.name AS vehicleName, v.plate AS vehiclePlate, v.ulId AS vehicleUlId,
           u.name AS creatorName, u.email AS creatorEmail,
           (SELECT COUNT(*) FROM "FleetTask" t WHERE t.dossierId = d.id AND t.ulId = d.ulId) AS taskCount,
           (SELECT COUNT(*) FROM "FleetTask" t WHERE t.dossierId = d.id AND t.ulId = d.ulId AND t.status <> 'DONE') AS openTaskCount,
           (SELECT COUNT(*) FROM "FleetDossierItem" i WHERE i.dossierId = d.id) AS itemCount,
           (SELECT COUNT(*) FROM "FleetDossierItem" i WHERE i.dossierId = d.id AND i.received = 0) AS missingItemCount,
           (SELECT COUNT(*) FROM "FleetAttachment" a WHERE a.ownerType = 'DOSSIER' AND a.ownerId = d.id) AS attachmentCount
    FROM "FleetDossier" d
    LEFT JOIN "Vehicle" v ON v.id = d.vehicleId
    LEFT JOIN "User" u ON u.id = d.createdBy`;

function toDossier(r: Row): FleetDossier {
    const status = String(r.status);
    const vehicleVisible = r.vehicleName != null && String(r.vehicleUlId) === String(r.ulId);
    return {
        id: String(r.id),
        title: String(r.title),
        description: (r.description as string | null) ?? null,
        status: (DOSSIER_STATUSES as readonly string[]).includes(status) ? status as DossierStatus : 'OPEN',
        pinned: Number(r.pinned) === 1,
        vehicle: vehicleVisible
            ? { id: String(r.vehicleId), name: String(r.vehicleName), plate: (r.vehiclePlate as string | null) ?? null, missing: false }
            : { id: String(r.vehicleId), name: 'Véhicule indisponible', plate: null, missing: true },
        createdByName: (r.creatorName as string | null) ?? (r.creatorEmail as string | null) ?? null,
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt),
        closedAt: (r.closedAt as string | null) ?? null,
        taskCount: Number(r.taskCount ?? 0),
        openTaskCount: Number(r.openTaskCount ?? 0),
        itemCount: Number(r.itemCount ?? 0),
        missingItemCount: Number(r.missingItemCount ?? 0),
        attachmentCount: Number(r.attachmentCount ?? 0),
    };
}

/** Dossiers de l'UL selon les filtres, les plus récents d'abord. */
export async function listDossiers(ulId: string, filters: DossierFilters): Promise<FleetDossier[]> {
    const where = ['d.ulId = ?'];
    const args: string[] = [ulId];
    if (filters.status) {
        where.push('d.status = ?');
        args.push(filters.status);
    }
    if (filters.vehicle) {
        where.push('d.vehicleId = ?');
        args.push(filters.vehicle);
    }
    if (filters.pinned) where.push('d.pinned = 1');
    const res = await db.execute({
        sql: `${DOSSIER_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.createdAt DESC, d.id`,
        args,
    });
    return res.rows.map(toDossier);
}

async function listItems(dossierId: string): Promise<DossierItem[]> {
    const res = await db.execute({
        sql: `SELECT i.id, i.label, i.received, i.receivedValue, i.attachmentId, i.receivedAt, i.position, i.createdAt,
                     a.fileName AS attachmentName, u.name AS receiverName, u.email AS receiverEmail
              FROM "FleetDossierItem" i
              LEFT JOIN "FleetAttachment" a ON a.id = i.attachmentId AND a.ownerType = 'DOSSIER' AND a.ownerId = i.dossierId
              LEFT JOIN "User" u ON u.id = i.receivedBy
              WHERE i.dossierId = ? ORDER BY i.position, i.createdAt, i.id`,
        args: [dossierId],
    });
    return res.rows.map(toItem);
}

function toItem(r: Row): DossierItem {
    const attachmentName = (r.attachmentName as string | null) ?? null;
    return {
        id: String(r.id),
        label: String(r.label),
        received: Number(r.received) === 1,
        receivedValue: (r.receivedValue as string | null) ?? null,
        attachmentId: attachmentName ? String(r.attachmentId) : null,
        attachmentName,
        receivedAt: (r.receivedAt as string | null) ?? null,
        receivedByName: (r.receiverName as string | null) ?? (r.receiverEmail as string | null) ?? null,
        position: Number(r.position ?? 0),
        createdAt: String(r.createdAt),
    };
}

/** Une pièce à récupérer (avec le nom de son fichier et de la personne qui l'a reçue). */
export async function getItem(dossierId: string, itemId: string): Promise<DossierItem | null> {
    const items = await listItems(dossierId);
    return items.find(i => i.id === itemId) ?? null;
}

/** Dossier enrichi : véhicule, compteurs, pièces à récupérer, tâches, pièces jointes. */
export async function getDossierDetail(id: string, ulId: string, sessionUserId: string | null): Promise<FleetDossierDetail | null> {
    const res = await db.execute({ sql: `${DOSSIER_SELECT} WHERE d.id = ? AND d.ulId = ?`, args: [id, ulId] });
    if (!res.rows[0]) return null;
    const [items, tasks, attachments] = await Promise.all([
        listItems(id),
        listTasks(ulId, { dossier: id }, sessionUserId),
        listAttachments('DOSSIER', id),
    ]);
    return { ...toDossier(res.rows[0]), items, tasks, attachments };
}

/**
 * Historique technique d'un véhicule dans l'UL : ses dossiers (ouverts et clos) et
 * les tâches qui lui sont rattachées (directement, ou via un de ses incidents ou
 * maintenances) hors de ses propres dossiers — hors dossier, ou dans le dossier d'un
 * autre véhicule —, du plus récent au plus ancien (date de création).
 */
export async function getVehicleHistory(ulId: string, vehicleId: string, sessionUserId: string | null): Promise<VehicleHistoryEntry[]> {
    const [dossiers, tasks] = await Promise.all([
        listDossiers(ulId, { vehicle: vehicleId }),
        listTasks(ulId, { vehicle: vehicleId }, sessionUserId, { outsideDossiersOfVehicle: vehicleId }),
    ]);
    const entries: VehicleHistoryEntry[] = [
        ...dossiers.map(d => ({ kind: 'DOSSIER' as const, date: d.createdAt, dossier: d })),
        ...tasks.map(t => ({ kind: 'TASK' as const, date: t.createdAt, task: t })),
    ];
    return entries.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Écriture ─────────────────────────────────────────────────────

export async function createDossier(ulId: string, input: CreateDossierInput, createdBy: string | null): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO "FleetDossier" (id, ulId, vehicleId, title, description, status, pinned, createdBy, createdAt, updatedAt, closedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            id, ulId, input.vehicleId, input.title, input.description ?? null, input.status,
            input.pinned ? 1 : 0, createdBy, now, now, input.status === 'CLOSED' ? now : null,
        ],
    });
    return id;
}

/**
 * Modification partielle. `closedAt` est posé à la clôture et effacé à la
 * réouverture. `false` si le dossier n'existe plus.
 */
export async function updateDossier(id: string, ulId: string, existing: { status: DossierStatus }, input: UpdateDossierInput): Promise<boolean> {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
        sets.push(`"${column}" = ?`);
        args.push(value);
    };
    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.pinned !== undefined) set('pinned', input.pinned ? 1 : 0);
    if (input.status !== undefined) {
        set('status', input.status);
        if (input.status === 'OPEN') set('closedAt', null);
        else if (existing.status !== 'CLOSED') set('closedAt', now);
    }
    set('updatedAt', now);
    const res = await db.execute({
        sql: `UPDATE "FleetDossier" SET ${sets.join(', ')} WHERE id = ? AND ulId = ?`,
        args: [...args, id, ulId],
    });
    return res.rowsAffected > 0;
}

/**
 * Supprime le dossier en une transaction : le dossier, ses pièces à récupérer et ses
 * pièces jointes (clés R2 capturées par `RETURNING`) ; ses tâches sont CONSERVÉES et
 * détachées (`dossierId` NULL). Puis, la base étant cohérente, les objets R2 au
 * mieux (un échec est journalisé). `false` si rien n'a été supprimé.
 */
export async function deleteDossier(id: string, ulId: string): Promise<boolean> {
    // Le dossier est supprimé EN DERNIER : les suppressions liées ne s'appliquent que
    // tant qu'il existe dans cette UL.
    const inUl = `EXISTS (SELECT 1 FROM "FleetDossier" WHERE id = ? AND ulId = ?)`;
    const results = await db.batch([
        { sql: `DELETE FROM "FleetAttachment" WHERE ownerType = 'DOSSIER' AND ownerId = ? AND ulId = ? AND ${inUl} RETURNING r2Key`, args: [id, ulId, id, ulId] },
        { sql: `DELETE FROM "FleetDossierItem" WHERE dossierId = ? AND ${inUl}`, args: [id, id, ulId] },
        { sql: `UPDATE "FleetTask" SET dossierId = NULL, updatedAt = ? WHERE dossierId = ? AND ulId = ? AND ${inUl}`, args: [new Date().toISOString(), id, ulId, id, ulId] },
        { sql: `DELETE FROM "FleetDossier" WHERE id = ? AND ulId = ?`, args: [id, ulId] },
    ], 'write');
    await deleteR2Objects(results[0].rows.map(r => String(r.r2Key)));
    return results[3].rowsAffected > 0;
}

// ── Pièces à récupérer ───────────────────────────────────────────

/** N'insère que si le dossier existe dans l'UL (suppression concurrente : rien d'orphelin). */
const DOSSIER_EXISTS_SQL = `WHERE EXISTS (SELECT 1 FROM "FleetDossier" WHERE id = ? AND ulId = ?)`;

export async function countItems(dossierId: string): Promise<number> {
    const res = await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetDossierItem" WHERE dossierId = ?`, args: [dossierId] });
    return Number(res.rows[0]?.n ?? 0);
}

/** Ajoute une pièce à récupérer en fin de liste ; `null` si le dossier n'existe plus. */
export async function createItem(dossierId: string, ulId: string, label: string): Promise<string | null> {
    const id = crypto.randomUUID();
    const res = await db.execute({
        sql: `INSERT INTO "FleetDossierItem" (id, dossierId, label, received, position, createdAt)
              SELECT ?, ?, ?, 0, (SELECT COALESCE(MAX(position), -1) + 1 FROM "FleetDossierItem" WHERE dossierId = ?), ?
              ${DOSSIER_EXISTS_SQL}`,
        args: [id, dossierId, label, dossierId, new Date().toISOString(), dossierId, ulId],
    });
    return res.rowsAffected > 0 ? id : null;
}

/** La pièce jointe appartient-elle à ce dossier ? */
export async function isDossierAttachment(dossierId: string, attachmentId: string): Promise<boolean> {
    const res = await db.execute({
        sql: `SELECT 1 FROM "FleetAttachment" WHERE id = ? AND ownerType = 'DOSSIER' AND ownerId = ?`,
        args: [attachmentId, dossierId],
    });
    return res.rows.length > 0;
}

export async function getItemState(dossierId: string, itemId: string): Promise<{ received: boolean } | null> {
    const res = await db.execute({ sql: `SELECT received FROM "FleetDossierItem" WHERE id = ? AND dossierId = ?`, args: [itemId, dossierId] });
    return res.rows[0] ? { received: Number(res.rows[0].received) === 1 } : null;
}

/**
 * Modification d'une pièce à récupérer. Passage à « reçue » : date et auteur posés ;
 * décochée : valeur, fichier, date et auteur effacés (la pièce jointe reste dans le
 * dossier). Le fichier désigné doit être une pièce jointe de CE dossier, vérifié dans
 * l'UPDATE même (pas de lien pendant vers une PJ supprimée entre-temps).
 * `missing` : la pièce n'existe plus ; `invalid-attachment` : fichier hors du dossier.
 */
export async function updateItem(
    dossierId: string,
    itemId: string,
    existing: { received: boolean },
    input: UpdateItemInput,
    userId: string | null,
): Promise<'updated' | 'missing' | 'invalid-attachment'> {
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
        sets.push(`"${column}" = ?`);
        args.push(value);
    };
    if (input.label !== undefined) set('label', input.label);
    const received = input.received ?? existing.received;
    if (!received) {
        if (input.received === false) {
            set('received', 0);
            set('receivedValue', null);
            set('attachmentId', null);
            set('receivedAt', null);
            set('receivedBy', null);
        }
    } else {
        if (input.received === true && !existing.received) {
            set('received', 1);
            set('receivedAt', new Date().toISOString());
            set('receivedBy', userId);
        }
        if (input.receivedValue !== undefined) set('receivedValue', input.receivedValue);
        if (input.attachmentId !== undefined) set('attachmentId', input.attachmentId);
    }
    if (sets.length === 0) return 'updated';
    const where = ['id = ?', 'dossierId = ?'];
    const whereArgs: string[] = [itemId, dossierId];
    const attachmentId = received ? input.attachmentId : undefined;
    if (attachmentId) {
        where.push(`EXISTS (SELECT 1 FROM "FleetAttachment" WHERE id = ? AND ownerType = 'DOSSIER' AND ownerId = ?)`);
        whereArgs.push(attachmentId, dossierId);
    }
    const res = await db.execute({
        sql: `UPDATE "FleetDossierItem" SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`,
        args: [...args, ...whereArgs],
    });
    if (res.rowsAffected > 0) return 'updated';
    if (attachmentId && await getItemState(dossierId, itemId)) return 'invalid-attachment';
    return 'missing';
}

export async function deleteItem(dossierId: string, itemId: string): Promise<boolean> {
    const res = await db.execute({ sql: `DELETE FROM "FleetDossierItem" WHERE id = ? AND dossierId = ?`, args: [itemId, dossierId] });
    return res.rowsAffected > 0;
}
