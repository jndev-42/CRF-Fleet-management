import type { InStatement, Row } from '@libsql/client';
import { db } from '@/lib/db';
import {
    CLOSE_REASONS,
    DOSSIER_STATUSES,
    type DossierCloseReason,
    type CreateDossierInput,
    type DossierFilters,
    type DossierItem,
    type DossierStatus,
    type DossierVehicle,
    type FleetDossier,
    type FleetDossierDetail,
    type UpdateDossierInput,
    type UpdateItemInput,
    type VehicleHistoryEntry,
} from './dossiers';
import { dossierHasVehicleSql } from './schema';
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
    /** Véhicules du dossier (au moins un), dans l'ordre d'affichage. */
    vehicleIds: string[];
    title: string;
    status: DossierStatus;
}

/**
 * Véhicules d'un dossier, dans l'ordre : lignes de FleetDossierVehicle, ou à défaut
 * (dossier créé avant la reprise) `FleetDossier.vehicleId`.
 */
const DOSSIER_VEHICLE_ROWS = `
    SELECT d.id AS dossierId, d.ulId AS dossierUlId, COALESCE(dv.vehicleId, d.vehicleId) AS vehicleId,
           v.name AS vehicleName, v.plate AS vehiclePlate, v.ulId AS vehicleUlId
    FROM "FleetDossier" d
    LEFT JOIN "FleetDossierVehicle" dv ON dv.dossierId = d.id
    LEFT JOIN "Vehicle" v ON v.id = COALESCE(dv.vehicleId, d.vehicleId)`;

/** Ligne brute d'un dossier (toutes UL) : sert au contrôle d'appartenance. */
export async function getDossierRow(id: string): Promise<DossierRow | null> {
    const [res, vehicles] = await Promise.all([
        db.execute({ sql: `SELECT id, ulId, title, status FROM "FleetDossier" WHERE id = ?`, args: [id] }),
        db.execute({ sql: `${DOSSIER_VEHICLE_ROWS} WHERE d.id = ? ORDER BY dv.position, dv.vehicleId`, args: [id] }),
    ]);
    const r = res.rows[0];
    if (!r) return null;
    const status = String(r.status);
    return {
        id: String(r.id), ulId: String(r.ulId), vehicleIds: vehicles.rows.map(v => String(v.vehicleId)), title: String(r.title),
        status: (DOSSIER_STATUSES as readonly string[]).includes(status) ? status as DossierStatus : 'OPEN',
    };
}

/** Véhicule de l'UL (par identifiant), ou `null`. */
export async function getUlVehicle(ulId: string, vehicleId: string): Promise<{ id: string; name: string } | null> {
    const res = await db.execute({ sql: `SELECT id, name FROM "Vehicle" WHERE id = ? AND ulId = ?`, args: [vehicleId, ulId] });
    const r = res.rows[0];
    return r ? { id: String(r.id), name: String(r.name) } : null;
}

/** Parmi `vehicleIds`, ceux qui sont des véhicules de l'UL. */
export async function getUlVehicleIds(ulId: string, vehicleIds: string[]): Promise<Set<string>> {
    if (vehicleIds.length === 0) return new Set();
    const res = await db.execute({
        sql: `SELECT id FROM "Vehicle" WHERE ulId = ? AND id IN (${vehicleIds.map(() => '?').join(', ')})`,
        args: [ulId, ...vehicleIds],
    });
    return new Set(res.rows.map(r => String(r.id)));
}

// ── Lecture ──────────────────────────────────────────────────────

const DOSSIER_SELECT = `
    SELECT d.id, d.ulId, d.title, d.description, d.status, d.pinned, d.createdAt, d.updatedAt, d.closedAt, d.closeReason, d.sourceType, d.sourceId,
           u.name AS creatorName, u.email AS creatorEmail,
           (SELECT COUNT(*) FROM "FleetTask" t WHERE t.dossierId = d.id AND t.ulId = d.ulId) AS taskCount,
           (SELECT COUNT(*) FROM "FleetTask" t WHERE t.dossierId = d.id AND t.ulId = d.ulId AND t.status <> 'DONE') AS openTaskCount,
           (SELECT COUNT(*) FROM "FleetDossierItem" i WHERE i.dossierId = d.id) AS itemCount,
           (SELECT COUNT(*) FROM "FleetDossierItem" i WHERE i.dossierId = d.id AND i.received = 0) AS missingItemCount,
           (SELECT COUNT(*) FROM "FleetAttachment" a WHERE a.ownerType = 'DOSSIER' AND a.ownerId = d.id) AS attachmentCount
    FROM "FleetDossier" d
    LEFT JOIN "User" u ON u.id = d.createdBy`;

/** Un véhicule sorti de l'UL du dossier (changé d'UL, supprimé) n'est plus nommé. */
function toDossierVehicle(r: Row): DossierVehicle {
    const visible = r.vehicleName != null && String(r.vehicleUlId) === String(r.dossierUlId);
    return visible
        ? { id: String(r.vehicleId), name: String(r.vehicleName), plate: (r.vehiclePlate as string | null) ?? null, missing: false }
        : { id: String(r.vehicleId), name: 'Véhicule indisponible', plate: null, missing: true };
}

/** Véhicules de chaque dossier (par lots : la liste d'une UL peut être longue). */
async function loadDossierVehicles(dossierIds: string[]): Promise<Map<string, DossierVehicle[]>> {
    const out = new Map<string, DossierVehicle[]>();
    const CHUNK = 400;
    for (let i = 0; i < dossierIds.length; i += CHUNK) {
        const ids = dossierIds.slice(i, i + CHUNK);
        const res = await db.execute({
            sql: `${DOSSIER_VEHICLE_ROWS} WHERE d.id IN (${ids.map(() => '?').join(', ')}) ORDER BY d.id, dv.position, dv.vehicleId`,
            args: ids,
        });
        for (const r of res.rows) {
            const id = String(r.dossierId);
            const list = out.get(id) ?? [];
            list.push(toDossierVehicle(r));
            out.set(id, list);
        }
    }
    return out;
}

function toDossier(r: Row, vehicles: DossierVehicle[]): FleetDossier {
    const status = String(r.status);
    return {
        id: String(r.id),
        title: String(r.title),
        description: (r.description as string | null) ?? null,
        status: (DOSSIER_STATUSES as readonly string[]).includes(status) ? status as DossierStatus : 'OPEN',
        pinned: Number(r.pinned) === 1,
        vehicles,
        createdByName: (r.creatorName as string | null) ?? (r.creatorEmail as string | null) ?? null,
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt),
        closedAt: (r.closedAt as string | null) ?? null,
        closeReason: (CLOSE_REASONS as readonly string[]).includes(String(r.closeReason)) ? r.closeReason as DossierCloseReason : null,
        sourceType: r.sourceType === 'INCIDENT_REPORT' ? 'INCIDENT_REPORT' : null,
        sourceId: r.sourceType === 'INCIDENT_REPORT' ? (r.sourceId as string | null) ?? null : null,
        taskCount: Number(r.taskCount ?? 0),
        openTaskCount: Number(r.openTaskCount ?? 0),
        itemCount: Number(r.itemCount ?? 0),
        missingItemCount: Number(r.missingItemCount ?? 0),
        attachmentCount: Number(r.attachmentCount ?? 0),
    };
}

/** Lignes de dossiers enrichies de leurs véhicules. */
async function withVehicles(rows: Row[]): Promise<FleetDossier[]> {
    const vehicles = await loadDossierVehicles(rows.map(r => String(r.id)));
    return rows.map(r => toDossier(r, vehicles.get(String(r.id)) ?? []));
}

/** Dossiers de l'UL selon les filtres (`vehicle` : dossiers portant ce véhicule), les plus récents d'abord. */
export async function listDossiers(ulId: string, filters: DossierFilters): Promise<FleetDossier[]> {
    const where = ['d.ulId = ?'];
    const args: string[] = [ulId];
    // OPEN = « ouverts » : Nouveau, En cours et En attente.
    if (filters.status === 'OPEN') where.push(`d.status <> 'CLOSED'`);
    else if (filters.status === 'CLOSED') where.push(`d.status = 'CLOSED'`);
    if (filters.vehicle) {
        where.push(dossierHasVehicleSql('d'));
        args.push(filters.vehicle, filters.vehicle);
    }
    if (filters.pinned) where.push('d.pinned = 1');
    const res = await db.execute({
        sql: `${DOSSIER_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.createdAt DESC, d.id`,
        args,
    });
    return withVehicles(res.rows);
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
    const [[dossier], items, tasks, attachments] = await Promise.all([
        withVehicles([res.rows[0]]),
        listItems(id),
        listTasks(ulId, { dossier: id }, sessionUserId),
        listAttachments('DOSSIER', id),
    ]);
    return { ...dossier, items, tasks, attachments };
}

/**
 * Historique technique d'un véhicule dans l'UL : les dossiers qui le portent (ouverts
 * et clos, seul ou avec d'autres véhicules) et les tâches qui lui sont rattachées
 * (directement, ou via un de ses incidents ou maintenances) hors de ces dossiers —
 * hors dossier, ou dans un dossier qui ne le porte pas —, du plus récent au plus
 * ancien (date de création).
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

/** Lignes FleetDossierVehicle d'un dossier, insérées seulement s'il existe dans l'UL. */
function insertVehicleLinks(dossierId: string, ulId: string, vehicleIds: string[]): InStatement[] {
    return vehicleIds.map((vehicleId, position) => ({
        sql: `INSERT INTO "FleetDossierVehicle" (dossierId, vehicleId, position)
              SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM "FleetDossier" WHERE id = ? AND ulId = ?)`,
        args: [dossierId, vehicleId, position, dossierId, ulId],
    }));
}

/**
 * Ouvre un dossier sur un ou plusieurs véhicules (déjà vérifiés dans l'UL) en une
 * transaction. `FleetDossier.vehicleId` reçoit le premier.
 */
export async function createDossier(ulId: string, input: CreateDossierInput, createdBy: string | null): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
        {
            sql: `INSERT INTO "FleetDossier" (id, ulId, vehicleId, title, description, status, pinned, createdBy, createdAt, updatedAt, closedAt, closeReason)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id, ulId, input.vehicleIds[0], input.title, input.description ?? null, input.status,
                input.pinned ? 1 : 0, createdBy, now, now, input.status === 'CLOSED' ? now : null,
                input.status === 'CLOSED' ? input.closeReason ?? null : null,
            ],
        },
        ...insertVehicleLinks(id, ulId, input.vehicleIds),
    ], 'write');
    return id;
}

/**
 * Modification partielle. `closedAt` est posé à la clôture et effacé à la
 * réouverture. `vehicleIds` (déjà vérifiés) remplace la liste des véhicules, dans la
 * même transaction. `false` si le dossier n'existe plus.
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
    if (input.vehicleIds !== undefined) set('vehicleId', input.vehicleIds[0]);
    if (input.status !== undefined) {
        set('status', input.status);
        if (input.status === 'CLOSED') {
            if (existing.status !== 'CLOSED') set('closedAt', now);
            set('closeReason', input.closeReason ?? null);
        } else {
            // Réouverture (ou passage Nouveau / En cours / En attente) : plus de clôture.
            set('closedAt', null);
            set('closeReason', null);
        }
    } else if (input.closeReason !== undefined) {
        set('closeReason', input.closeReason);
    }
    set('updatedAt', now);
    const update: InStatement = {
        sql: `UPDATE "FleetDossier" SET ${sets.join(', ')} WHERE id = ? AND ulId = ?`,
        args: [...args, id, ulId],
    };
    if (input.vehicleIds === undefined) return (await db.execute(update)).rowsAffected > 0;
    const results = await db.batch([
        update,
        { sql: `DELETE FROM "FleetDossierVehicle" WHERE dossierId = ? AND EXISTS (SELECT 1 FROM "FleetDossier" WHERE id = ? AND ulId = ?)`, args: [id, id, ulId] },
        ...insertVehicleLinks(id, ulId, input.vehicleIds),
    ], 'write');
    return results[0].rowsAffected > 0;
}

/**
 * Supprime le dossier en une transaction : le dossier, ses véhicules, ses pièces à
 * récupérer et ses pièces jointes (clés R2 capturées par `RETURNING`) ; ses tâches sont CONSERVÉES et
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
        { sql: `DELETE FROM "FleetDossierVehicle" WHERE dossierId = ? AND ${inUl}`, args: [id, id, ulId] },
        { sql: `DELETE FROM "FleetDossier" WHERE id = ? AND ulId = ?`, args: [id, ulId] },
    ], 'write');
    await deleteR2Objects(results[0].rows.map(r => String(r.r2Key)));
    return results[4].rowsAffected > 0;
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
