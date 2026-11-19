import { addDays, CONTROL_SOON_DAYS, parisDay } from './controls';
import type { InStatement, Row } from '@libsql/client';
import { db } from '@/lib/db';
import { canManageVehicles, ROLE_LABELS, ROLES } from '@/lib/roles';
import { computeSessionRoles } from '@/lib/session-roles';
import { listActiveUlMembers } from '@/lib/ulMembers';
import type { AttachmentOwnerType } from './attachments';
import { parsePhones } from './contacts';
import { dossierHasVehicleSql } from './schema';
import {
    dedupeLinks,
    formatFrDate,
    LINK_TYPE_LABELS,
    LINK_TYPES,
    TASK_PRIORITIES,
    TASK_STATUSES,
    type AssignableManager,
    type CreateTaskInput,
    type FleetTask,
    type FleetTaskDetail,
    type LinkTarget,
    type LinkType,
    type TaskAttachment,
    type TaskFilters,
    type TaskLink,
    type TaskLinkInput,
    type TaskPriority,
    type TaskStatus,
    type UpdateTaskInput,
} from './tasks';

/**
 * Accès base des tâches du suivi technique. Le cloisonnement d'accès (session, rôle,
 * UL de la tâche) est décidé par les routes ; ce module valide les cibles (assignés,
 * rattachements) dans le périmètre de l'UL qu'on lui passe et exécute.
 */

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

// ── Assignés ─────────────────────────────────────────────────────

/**
 * Responsables assignables d'une UL : comptes actifs rattachés à l'UL (`UserUL`)
 * dont les rôles DANS CETTE UL (même cascade que la session) satisfont
 * `canManageVehicles` — RESP_VEHICULE, ADMIN, SUPER_ADMIN ; un INACTIF est exclu.
 */
export async function listAssignableManagers(ulId: string): Promise<AssignableManager[]> {
    const members = await listActiveUlMembers(ulId);
    if (members.length === 0) return [];
    const ids = members.map(m => m.id);
    const [globalRes, ulRes] = await Promise.all([
        db.execute({
            sql: `SELECT ur.userId, r.name FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id
                  WHERE ur.userId IN (${placeholders(ids.length)})`,
            args: ids,
        }),
        db.execute({
            sql: `SELECT userId, ulId, is_home, roles FROM "UserUL" WHERE userId IN (${placeholders(ids.length)})`,
            args: ids,
        }),
    ]);
    const globalByUser = new Map<string, string[]>();
    for (const r of globalRes.rows) {
        const list = globalByUser.get(String(r.userId)) ?? [];
        list.push(String(r.name));
        globalByUser.set(String(r.userId), list);
    }
    const ulRowsByUser = new Map<string, { ulId: unknown; is_home: unknown; roles: unknown }[]>();
    for (const r of ulRes.rows) {
        const list = ulRowsByUser.get(String(r.userId)) ?? [];
        list.push({ ulId: r.ulId, is_home: r.is_home, roles: r.roles });
        ulRowsByUser.set(String(r.userId), list);
    }

    const out: AssignableManager[] = [];
    for (const m of members) {
        const roles = computeSessionRoles(globalByUser.get(m.id) ?? [], ulRowsByUser.get(m.id) ?? [], ulId);
        if (!canManageVehicles(roles)) continue;
        const main = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.RESP_VEHICULE].find(r => roles.includes(r)) ?? ROLES.RESP_VEHICULE;
        out.push({ id: m.id, name: m.name || m.email, email: m.email, roleLabel: ROLE_LABELS[main] });
    }
    return out;
}

/**
 * Identifiants refusés parmi `ids` (non assignables dans l'UL). `alreadyAssigned` :
 * assignés déjà présents sur la tâche, conservés même s'ils ont perdu le rôle depuis
 * (le client renvoie la liste complète à chaque modification).
 */
export async function invalidAssignees(ulId: string, ids: string[], alreadyAssigned: string[] = []): Promise<string[]> {
    const toCheck = ids.filter(id => !alreadyAssigned.includes(id));
    if (toCheck.length === 0) return [];
    const allowed = new Set((await listAssignableManagers(ulId)).map(m => m.id));
    return toCheck.filter(id => !allowed.has(id));
}

// ── Rattachements ────────────────────────────────────────────────

/**
 * Contact visible depuis l'UL : le sien, ou partagé par une UL qui existe encore
 * (même règle que la liste des contacts et la recherche de rattachements).
 */
const CONTACT_VISIBLE_SQL = `(c.ulId = ? OR (c.shared = 1 AND EXISTS (SELECT 1 FROM "UniteLocale" ou WHERE ou.id = c.ulId)))`;

/** Requête des identifiants d'un type VISIBLES depuis l'UL, parmi `ids`. */
function scopedIdsQuery(type: LinkType, ulId: string, ids: string[]): InStatement {
    const ph = placeholders(ids.length);
    switch (type) {
        case 'VEHICLE':
            return { sql: `SELECT id FROM "Vehicle" WHERE ulId = ? AND id IN (${ph})`, args: [ulId, ...ids] };
        case 'CONTACT':
            return { sql: `SELECT c.id FROM "FleetContact" c WHERE ${CONTACT_VISIBLE_SQL} AND c.id IN (${ph})`, args: [ulId, ...ids] };
        case 'INCIDENT':
            return {
                sql: `SELECT ir.id FROM "IncidentReport" ir JOIN "Vehicle" v ON v.id = ir.vehicleId
                      WHERE v.ulId = ? AND ir.id IN (${ph})`,
                args: [ulId, ...ids],
            };
        case 'MAINTENANCE':
            return {
                sql: `SELECT vm.id FROM "VehicleMaintenance" vm JOIN "Vehicle" v ON v.id = vm.vehicleId
                      WHERE v.ulId = ? AND vm.id IN (${ph})`,
                args: [ulId, ...ids],
            };
    }
}

/**
 * Premier rattachement invalide (cible inexistante ou hors du périmètre de l'UL),
 * ou `null`. `alreadyLinked` : rattachements déjà présents sur la tâche, conservés
 * sans revalidation (contact retiré du partage depuis, par exemple).
 */
export async function firstInvalidLink(ulId: string, links: TaskLinkInput[], alreadyLinked: TaskLinkInput[] = []): Promise<TaskLinkInput | null> {
    const known = new Set(alreadyLinked.map(l => `${l.type}:${l.id}`));
    const toCheck = dedupeLinks(links).filter(l => !known.has(`${l.type}:${l.id}`));
    for (const type of LINK_TYPES) {
        const ids = toCheck.filter(l => l.type === type).map(l => l.id);
        if (ids.length === 0) continue;
        const res = await db.execute(scopedIdsQuery(type, ulId, ids));
        const found = new Set(res.rows.map(r => String(r.id)));
        const missing = ids.find(id => !found.has(id));
        if (missing) return { type, id: missing };
    }
    return null;
}

/** Libellés des rattachements, résolus en lot et dans le périmètre de l'UL. */
async function resolveLinks(ulId: string, links: TaskLinkInput[]): Promise<Map<string, TaskLink>> {
    const out = new Map<string, TaskLink>();
    const byType = (type: LinkType) => [...new Set(links.filter(l => l.type === type).map(l => l.id))];
    const put = (link: Omit<TaskLink, 'missing'>) => out.set(`${link.type}:${link.id}`, { ...link, missing: false });

    const vehicleIds = byType('VEHICLE');
    if (vehicleIds.length) {
        const res = await db.execute({
            sql: `SELECT id, name, plate FROM "Vehicle" WHERE ulId = ? AND id IN (${placeholders(vehicleIds.length)})`,
            args: [ulId, ...vehicleIds],
        });
        for (const r of res.rows) {
            put({ type: 'VEHICLE', id: String(r.id), label: String(r.name), detail: (r.plate as string | null) ?? null, phone: null, vehicleName: String(r.name) });
        }
    }

    const contactIds = byType('CONTACT');
    if (contactIds.length) {
        const res = await db.execute({
            sql: `SELECT c.id, c.ulId, c.name, c.phones, u.name AS ulName FROM "FleetContact" c
                  LEFT JOIN "UniteLocale" u ON u.id = c.ulId
                  WHERE ${CONTACT_VISIBLE_SQL} AND c.id IN (${placeholders(contactIds.length)})`,
            args: [ulId, ...contactIds],
        });
        for (const r of res.rows) {
            const phones = parsePhones(r.phones);
            const foreign = String(r.ulId) !== ulId;
            put({
                type: 'CONTACT',
                id: String(r.id),
                label: String(r.name),
                detail: foreign && r.ulName ? `Proposé par l'UL ${String(r.ulName)}` : null,
                phone: phones[0]?.number ?? null,
                vehicleName: null,
            });
        }
    }

    const incidentIds = byType('INCIDENT');
    if (incidentIds.length) {
        const res = await db.execute({
            sql: `SELECT ir.id, ir.occurredAt, ir.createdAt, v.name AS vehicleName FROM "IncidentReport" ir
                  JOIN "Vehicle" v ON v.id = ir.vehicleId
                  WHERE v.ulId = ? AND ir.id IN (${placeholders(incidentIds.length)})`,
            args: [ulId, ...incidentIds],
        });
        for (const r of res.rows) put(incidentTarget(r));
    }

    const maintenanceIds = byType('MAINTENANCE');
    if (maintenanceIds.length) {
        const res = await db.execute({
            sql: `SELECT vm.id, vm.startDate, vm.reason, v.name AS vehicleName FROM "VehicleMaintenance" vm
                  JOIN "Vehicle" v ON v.id = vm.vehicleId
                  WHERE v.ulId = ? AND vm.id IN (${placeholders(maintenanceIds.length)})`,
            args: [ulId, ...maintenanceIds],
        });
        for (const r of res.rows) put(maintenanceTarget(r));
    }

    for (const l of links) {
        const key = `${l.type}:${l.id}`;
        if (!out.has(key)) {
            out.set(key, {
                type: l.type, id: l.id, label: `${LINK_TYPE_LABELS[l.type]} indisponible`,
                detail: null, phone: null, vehicleName: null, missing: true,
            });
        }
    }
    return out;
}

function incidentTarget(r: Row): Omit<TaskLink, 'missing'> {
    const date = formatFrDate((r.occurredAt as string | null) ?? (r.createdAt as string | null));
    return {
        type: 'INCIDENT', id: String(r.id), label: date ? `Incident du ${date}` : 'Incident',
        detail: String(r.vehicleName), phone: null, vehicleName: String(r.vehicleName),
    };
}

function maintenanceTarget(r: Row): Omit<TaskLink, 'missing'> {
    const date = formatFrDate(r.startDate as string | null);
    const reason = (r.reason as string | null) ?? '';
    return {
        type: 'MAINTENANCE', id: String(r.id), label: date ? `Maintenance du ${date}` : 'Maintenance',
        detail: [String(r.vehicleName), reason].filter(Boolean).join(' · '), phone: null, vehicleName: String(r.vehicleName),
    };
}

/**
 * Cibles rattachables visibles depuis l'UL, par type (tous si `type` absent),
 * filtrées par `q` (nom, immatriculation, motif…). 20 par type au plus.
 */
export async function searchLinkTargets(ulId: string, type: LinkType | null, q: string): Promise<LinkTarget[]> {
    const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    const limit = type ? 30 : 8;
    // Liste complète des véhicules de l'UL sans recherche (filtre « par véhicule ») ; LIMIT -1 = sans limite.
    const vehicleLimit = type === 'VEHICLE' && q === '' ? -1 : limit;
    const types = type ? [type] : [...LINK_TYPES];
    const out: LinkTarget[] = [];
    for (const t of types) {
        if (t === 'VEHICLE') {
            const res = await db.execute({
                sql: `SELECT id, name, plate FROM "Vehicle" WHERE ulId = ?
                      AND (name LIKE ? ESCAPE '\\' OR COALESCE(plate, '') LIKE ? ESCAPE '\\')
                      ORDER BY name COLLATE NOCASE LIMIT ?`,
                args: [ulId, like, like, vehicleLimit],
            });
            for (const r of res.rows) out.push({ type: 'VEHICLE', id: String(r.id), label: String(r.name), detail: (r.plate as string | null) ?? null });
        } else if (t === 'CONTACT') {
            const res = await db.execute({
                sql: `SELECT c.id, c.ulId, c.name, c.category, u.name AS ulName FROM "FleetContact" c
                      LEFT JOIN "UniteLocale" u ON u.id = c.ulId
                      WHERE ${CONTACT_VISIBLE_SQL}
                      AND (c.name LIKE ? ESCAPE '\\' OR c.category LIKE ? ESCAPE '\\')
                      ORDER BY (c.ulId = ?) DESC, c.name COLLATE NOCASE LIMIT ?`,
                args: [ulId, like, like, ulId, limit],
            });
            for (const r of res.rows) {
                const foreign = String(r.ulId) !== ulId;
                out.push({ type: 'CONTACT', id: String(r.id), label: String(r.name), detail: foreign ? `Proposé par l'UL ${String(r.ulName ?? '')}` : null });
            }
        } else if (t === 'INCIDENT') {
            const res = await db.execute({
                sql: `SELECT ir.id, ir.occurredAt, ir.createdAt, v.name AS vehicleName FROM "IncidentReport" ir
                      JOIN "Vehicle" v ON v.id = ir.vehicleId
                      WHERE v.ulId = ? AND (v.name LIKE ? ESCAPE '\\' OR COALESCE(ir.description, '') LIKE ? ESCAPE '\\'
                        OR COALESCE(ir.occurredAt, '') LIKE ? ESCAPE '\\')
                      ORDER BY COALESCE(ir.occurredAt, ir.createdAt) DESC LIMIT ?`,
                args: [ulId, like, like, like, limit],
            });
            for (const r of res.rows) {
                const target = incidentTarget(r);
                out.push({ type: 'INCIDENT', id: target.id, label: target.label, detail: target.detail });
            }
        } else {
            const res = await db.execute({
                sql: `SELECT vm.id, vm.startDate, vm.reason, v.name AS vehicleName FROM "VehicleMaintenance" vm
                      JOIN "Vehicle" v ON v.id = vm.vehicleId
                      WHERE v.ulId = ? AND (v.name LIKE ? ESCAPE '\\' OR vm.reason LIKE ? ESCAPE '\\')
                      ORDER BY vm.startDate DESC LIMIT ?`,
                args: [ulId, like, like, limit],
            });
            for (const r of res.rows) {
                const target = maintenanceTarget(r);
                out.push({ type: 'MAINTENANCE', id: target.id, label: target.label, detail: target.detail });
            }
        }
    }
    return out;
}

// ── Lecture ──────────────────────────────────────────────────────

const TASK_COLUMNS = `t.id, t.ulId, t.dossierId, t.title, t.description, t.status, t.priority, t.dueDate, t.pinned, t.completedAt, t.createdAt, t.updatedAt`;

interface TaskRow extends Omit<FleetTask, 'assignees' | 'links' | 'attachmentCount'> {
    ulId: string;
}

function toTaskRow(r: Row): TaskRow {
    const status = String(r.status);
    const priority = String(r.priority);
    return {
        id: String(r.id),
        ulId: String(r.ulId),
        dossierId: (r.dossierId as string | null) ?? null,
        title: String(r.title),
        description: (r.description as string | null) ?? null,
        status: (TASK_STATUSES as readonly string[]).includes(status) ? status as TaskStatus : 'TODO',
        priority: (TASK_PRIORITIES as readonly string[]).includes(priority) ? priority as TaskPriority : 'NORMAL',
        dueDate: (r.dueDate as string | null) ?? null,
        pinned: Number(r.pinned) === 1,
        completedAt: (r.completedAt as string | null) ?? null,
        createdAt: String(r.createdAt),
        updatedAt: String(r.updatedAt),
    };
}

/** Assignés, rattachements résolus et nombre de pièces jointes, en lot. */
async function enrich(ulId: string, rows: TaskRow[]): Promise<FleetTask[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const ph = placeholders(ids.length);
    const [assigneeRes, linkRes, countRes] = await Promise.all([
        db.execute({
            sql: `SELECT a.taskId, a.userId, u.name, u.email FROM "FleetTaskAssignee" a
                  LEFT JOIN "User" u ON u.id = a.userId
                  WHERE a.taskId IN (${ph}) ORDER BY a.assignedAt, a.userId`,
            args: ids,
        }),
        db.execute({
            sql: `SELECT taskId, targetType, targetId FROM "FleetTaskLink" WHERE taskId IN (${ph}) ORDER BY createdAt, id`,
            args: ids,
        }),
        db.execute({
            sql: `SELECT ownerId, COUNT(*) AS n FROM "FleetAttachment" WHERE ownerType = 'TASK' AND ownerId IN (${ph}) GROUP BY ownerId`,
            args: ids,
        }),
    ]);
    const rawLinks = linkRes.rows
        .filter(r => (LINK_TYPES as readonly string[]).includes(String(r.targetType)))
        .map(r => ({ taskId: String(r.taskId), type: String(r.targetType) as LinkType, id: String(r.targetId) }));
    const resolved = await resolveLinks(ulId, rawLinks);
    const counts = new Map(countRes.rows.map(r => [String(r.ownerId), Number(r.n)]));

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate,
        pinned: row.pinned,
        dossierId: row.dossierId,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        assignees: assigneeRes.rows
            .filter(a => String(a.taskId) === row.id)
            .map(a => ({ id: String(a.userId), name: String(a.name || a.email || 'Compte supprimé') })),
        links: rawLinks.filter(l => l.taskId === row.id).map(l => resolved.get(`${l.type}:${l.id}`)!),
        attachmentCount: counts.get(row.id) ?? 0,
    }));
}

/** Ligne brute d'une tâche (toutes UL) : sert au contrôle d'appartenance. */
export async function getTaskRow(id: string): Promise<TaskRow | null> {
    const res = await db.execute({ sql: `SELECT ${TASK_COLUMNS} FROM "FleetTask" t WHERE t.id = ?`, args: [id] });
    return res.rows[0] ? toTaskRow(res.rows[0]) : null;
}

/** Tâche enrichie avec ses pièces jointes. */
export async function getTaskDetail(id: string, ulId: string): Promise<FleetTaskDetail | null> {
    const row = await getTaskRow(id);
    if (!row || row.ulId !== ulId) return null;
    const [task] = await enrich(ulId, [row]);
    return { ...task, attachments: await listTaskAttachments(id) };
}

/**
 * Tâches de l'UL selon les filtres. `vehicle` : tâches rattachées au véhicule, ou à
 * un de ses incidents ou maintenances. `assignee=me` : la personne de la session.
 */
export async function listTasks(
    ulId: string,
    filters: TaskFilters,
    sessionUserId: string | null,
    /** Historique d'un véhicule : tâches hors dossier OU dans un dossier qui ne porte pas ce véhicule. */
    opts: { outsideDossiersOfVehicle?: string } = {},
): Promise<FleetTask[]> {
    const where = ['t.ulId = ?'];
    const args: (string | number)[] = [ulId];
    if (opts.outsideDossiersOfVehicle) {
        where.push(`(t.dossierId IS NULL OR NOT EXISTS (SELECT 1 FROM "FleetDossier" d WHERE d.id = t.dossierId AND ${dossierHasVehicleSql('d')}))`);
        args.push(opts.outsideDossiersOfVehicle, opts.outsideDossiersOfVehicle);
    }
    if (filters.pinned) where.push('t.pinned = 1');
    if (filters.due) {
        where.push(`t.status <> 'DONE' AND t.dueDate IS NOT NULL AND t.dueDate <= ?`);
        args.push(addDays(parisDay(), CONTROL_SOON_DAYS));
    }
    if (filters.priority) {
        where.push('t.priority = ?');
        args.push(filters.priority);
    }
    if (filters.status) {
        const statuses = filters.status.split(',');
        where.push(`t.status IN (${placeholders(statuses.length)})`);
        args.push(...statuses);
    }
    if (filters.q) {
        const like = `%${filters.q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
        where.push(`(t.title LIKE ? ESCAPE '\\' OR COALESCE(t.description, '') LIKE ? ESCAPE '\\')`);
        args.push(like, like);
    }
    if (filters.assignee) {
        const userId = filters.assignee === 'me' ? sessionUserId : filters.assignee;
        if (!userId) return [];
        where.push(`EXISTS (SELECT 1 FROM "FleetTaskAssignee" a WHERE a.taskId = t.id AND a.userId = ?)`);
        args.push(userId);
    }
    if (filters.dossier) {
        if (filters.dossier === 'none') where.push('t.dossierId IS NULL');
        else {
            where.push('t.dossierId = ?');
            args.push(filters.dossier);
        }
    }
    if (filters.vehicle) {
        where.push(`EXISTS (SELECT 1 FROM "FleetTaskLink" l WHERE l.taskId = t.id AND (
            (l.targetType = 'VEHICLE' AND l.targetId = ?)
            OR (l.targetType = 'INCIDENT' AND l.targetId IN (SELECT id FROM "IncidentReport" WHERE vehicleId = ?))
            OR (l.targetType = 'MAINTENANCE' AND l.targetId IN (SELECT id FROM "VehicleMaintenance" WHERE vehicleId = ?))
        ))`);
        args.push(filters.vehicle, filters.vehicle, filters.vehicle);
    }
    const res = await db.execute({
        sql: `SELECT ${TASK_COLUMNS} FROM "FleetTask" t WHERE ${where.join(' AND ')} ORDER BY t.createdAt DESC, t.id`,
        args,
    });
    return enrich(ulId, res.rows.map(toTaskRow));
}

export async function getTaskAssigneeIds(taskId: string): Promise<string[]> {
    const res = await db.execute({ sql: `SELECT userId FROM "FleetTaskAssignee" WHERE taskId = ?`, args: [taskId] });
    return res.rows.map(r => String(r.userId));
}

export async function getTaskLinkInputs(taskId: string): Promise<TaskLinkInput[]> {
    const res = await db.execute({ sql: `SELECT targetType, targetId FROM "FleetTaskLink" WHERE taskId = ?`, args: [taskId] });
    return res.rows.map(r => ({ type: String(r.targetType) as LinkType, id: String(r.targetId) }));
}

// ── Écriture ─────────────────────────────────────────────────────

/** N'insère que si la tâche existe dans l'UL (suppression concurrente : rien d'orphelin). */
const TASK_EXISTS_SQL = `WHERE EXISTS (SELECT 1 FROM "FleetTask" WHERE id = ? AND ulId = ?)`;

function assigneeInserts(taskId: string, ulId: string, userIds: string[], now: string): InStatement[] {
    return [...new Set(userIds)].map(userId => ({
        sql: `INSERT OR IGNORE INTO "FleetTaskAssignee" (taskId, userId, assignedAt) SELECT ?, ?, ? ${TASK_EXISTS_SQL}`,
        args: [taskId, userId, now, taskId, ulId],
    }));
}

function linkInserts(taskId: string, ulId: string, links: TaskLinkInput[], now: string): InStatement[] {
    return dedupeLinks(links).map(l => ({
        sql: `INSERT OR IGNORE INTO "FleetTaskLink" (id, taskId, targetType, targetId, createdAt) SELECT ?, ?, ?, ?, ? ${TASK_EXISTS_SQL}`,
        args: [crypto.randomUUID(), taskId, l.type, l.id, now, taskId, ulId],
    }));
}

/** Crée la tâche, ses assignés et ses rattachements en une transaction. */
export async function createTask(ulId: string, input: CreateTaskInput, createdBy: string | null): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
        {
            sql: `INSERT INTO "FleetTask" (id, ulId, dossierId, title, description, status, priority, dueDate, pinned, completedAt, createdBy, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id, ulId, input.dossierId ?? null, input.title, input.description ?? null, input.status, input.priority,
                input.dueDate ?? null, input.pinned ? 1 : 0, input.status === 'DONE' ? now : null,
                createdBy, now, now,
            ],
        },
        ...assigneeInserts(id, ulId, input.assigneeIds, now),
        ...linkInserts(id, ulId, input.links, now),
    ], 'write');
    return id;
}

/**
 * Modification partielle ; `assigneeIds` et `links`, s'ils sont fournis, REMPLACENT
 * les listes (les entrées conservées gardent leur date). `completedAt` est posé au
 * passage à DONE et effacé à la réouverture. `false` si la tâche n'existe plus.
 */
export async function updateTask(id: string, ulId: string, existing: { status: TaskStatus }, input: UpdateTaskInput): Promise<boolean> {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
        sets.push(`"${column}" = ?`);
        args.push(value);
    };
    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.priority !== undefined) set('priority', input.priority);
    if (input.dueDate !== undefined) set('dueDate', input.dueDate);
    if (input.pinned !== undefined) set('pinned', input.pinned ? 1 : 0);
    if (input.dossierId !== undefined) set('dossierId', input.dossierId);
    if (input.status !== undefined) {
        set('status', input.status);
        if (input.status !== 'DONE') set('completedAt', null);
        else if (existing.status !== 'DONE') set('completedAt', now);
    }
    set('updatedAt', now);

    const statements: InStatement[] = [{
        sql: `UPDATE "FleetTask" SET ${sets.join(', ')} WHERE id = ? AND ulId = ?`,
        args: [...args, id, ulId],
    }];
    if (input.assigneeIds !== undefined) {
        const keep = [...new Set(input.assigneeIds)];
        statements.push(keep.length
            ? { sql: `DELETE FROM "FleetTaskAssignee" WHERE taskId = ? AND userId NOT IN (${placeholders(keep.length)})`, args: [id, ...keep] }
            : { sql: `DELETE FROM "FleetTaskAssignee" WHERE taskId = ?`, args: [id] });
        statements.push(...assigneeInserts(id, ulId, keep, now));
    }
    if (input.links !== undefined) {
        const keep = dedupeLinks(input.links);
        statements.push(keep.length
            ? {
                sql: `DELETE FROM "FleetTaskLink" WHERE taskId = ? AND (targetType || ':' || targetId) NOT IN (${placeholders(keep.length)})`,
                args: [id, ...keep.map(l => `${l.type}:${l.id}`)],
            }
            : { sql: `DELETE FROM "FleetTaskLink" WHERE taskId = ?`, args: [id] });
        statements.push(...linkInserts(id, ulId, keep, now));
    }
    const results = await db.batch(statements, 'write');
    return results[0].rowsAffected > 0;
}

/**
 * Supprime la tâche en une transaction (tâche, pièces jointes, rattachements,
 * assignés), clés R2 des pièces jointes capturées par `RETURNING` ; puis, la base
 * étant cohérente, les objets R2 au mieux (un échec est journalisé — un orphelin R2
 * est inoffensif, une ligne pointant vers un objet supprimé ne l'est pas).
 */
export async function deleteTask(id: string, ulId: string): Promise<boolean> {
    const results = await db.batch([
        { sql: `DELETE FROM "FleetTask" WHERE id = ? AND ulId = ?`, args: [id, ulId] },
        { sql: `DELETE FROM "FleetAttachment" WHERE ownerType = 'TASK' AND ownerId = ? AND ulId = ? RETURNING r2Key`, args: [id, ulId] },
        { sql: `DELETE FROM "FleetTaskLink" WHERE taskId = ?`, args: [id] },
        { sql: `DELETE FROM "FleetTaskAssignee" WHERE taskId = ?`, args: [id] },
    ], 'write');
    await deleteR2Objects(results[1].rows.map(r => String(r.r2Key)));
    return results[0].rowsAffected > 0;
}

/** Suppression R2 au mieux, après la base : chaque échec est journalisé, jamais levé. */
export async function deleteR2Objects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { deleteObject } = await import('@/lib/r2');
    for (const key of keys) {
        try {
            await deleteObject(key);
        } catch (e: unknown) {
            console.error(`[fleet-tracking] suppression R2 de ${key} impossible :`, e instanceof Error ? e.message : String(e));
        }
    }
}

// ── Pièces jointes ───────────────────────────────────────────────

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
    return listAttachments('TASK', taskId);
}

/** Pièces jointes d'une tâche ou d'un dossier, de la plus ancienne à la plus récente. */
export async function listAttachments(ownerType: AttachmentOwnerType, ownerId: string): Promise<TaskAttachment[]> {
    const res = await db.execute({
        sql: `SELECT a.id, a.fileName, a.contentType, a.size, a.createdAt, u.name AS uploaderName, u.email AS uploaderEmail
              FROM "FleetAttachment" a LEFT JOIN "User" u ON u.id = a.uploadedBy
              WHERE a.ownerType = ? AND a.ownerId = ? ORDER BY a.createdAt, a.id`,
        args: [ownerType, ownerId],
    });
    return res.rows.map(r => ({
        id: String(r.id),
        fileName: String(r.fileName),
        contentType: String(r.contentType),
        size: Number(r.size),
        uploadedByName: (r.uploaderName as string | null) ?? (r.uploaderEmail as string | null) ?? null,
        createdAt: String(r.createdAt),
    }));
}

export interface AttachmentRow {
    id: string;
    ownerType: string;
    ownerId: string;
    ulId: string;
    r2Key: string;
    fileName: string;
    contentType: string;
}

export async function getAttachmentRow(id: string): Promise<AttachmentRow | null> {
    const res = await db.execute({
        sql: `SELECT id, ownerType, ownerId, ulId, r2Key, fileName, contentType FROM "FleetAttachment" WHERE id = ?`,
        args: [id],
    });
    const r = res.rows[0];
    if (!r) return null;
    return {
        id: String(r.id), ownerType: String(r.ownerType), ownerId: String(r.ownerId), ulId: String(r.ulId),
        r2Key: String(r.r2Key), fileName: String(r.fileName), contentType: String(r.contentType),
    };
}

export async function insertAttachment(a: {
    id: string; ownerType: AttachmentOwnerType; ownerId: string; ulId: string; r2Key: string;
    fileName: string; contentType: string; size: number; uploadedBy: string | null; createdAt: string;
}): Promise<void> {
    await db.execute({
        sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, uploadedBy, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [a.id, a.ownerType, a.ownerId, a.ulId, a.r2Key, a.fileName, a.contentType, a.size, a.uploadedBy, a.createdAt],
    });
}

/**
 * Supprime la ligne d'une pièce jointe, puis son objet R2 au mieux (base d'abord :
 * jamais de ligne pointant vers un objet supprimé). Une pièce à récupérer qui
 * désignait ce fichier le perd (dans la même transaction). `false` si rien n'a été
 * supprimé.
 */
export async function deleteAttachment(id: string, ulId: string): Promise<boolean> {
    const [res] = await db.batch([
        { sql: `DELETE FROM "FleetAttachment" WHERE id = ? AND ulId = ? RETURNING r2Key`, args: [id, ulId] },
        {
            sql: `UPDATE "FleetDossierItem" SET attachmentId = NULL
                  WHERE attachmentId = ? AND NOT EXISTS (SELECT 1 FROM "FleetAttachment" WHERE id = ?)`,
            args: [id, id],
        },
    ], 'write');
    if (res.rows.length === 0) return false;
    await deleteR2Objects(res.rows.map(r => String(r.r2Key)));
    return true;
}

/** Nombre de pièces jointes d'une tâche ou d'un dossier. */
export async function countAttachments(ownerType: AttachmentOwnerType, ownerId: string): Promise<number> {
    const res = await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetAttachment" WHERE ownerType = ? AND ownerId = ?`, args: [ownerType, ownerId] });
    return Number(res.rows[0]?.n ?? 0);
}

/** Nombre de pièces jointes d'une tâche. */
export async function countTaskAttachments(taskId: string): Promise<number> {
    return countAttachments('TASK', taskId);
}
