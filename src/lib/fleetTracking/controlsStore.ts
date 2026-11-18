import { db } from '@/lib/db';
import type { MaintenanceRecord } from '@/app/vehicles/[id]/types';
import {
    CONTROL_TYPES,
    computeControls,
    parisDay,
    type AppointmentInput,
    type ControlAppointment,
    type ControlRow,
    type ControlType,
    type ControlVehicle,
} from './controls';

/**
 * Accès base des contrôles à échéance (livrable 4) — **serveur uniquement**.
 * Lit `Vehicle` et `VehicleMaintenanceRecord` sans jamais y écrire ; seul
 * `FleetControlAppointment` est écrit.
 */

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

function toControlType(v: unknown): ControlType | null {
    return (CONTROL_TYPES as readonly string[]).includes(String(v)) ? String(v) as ControlType : null;
}

/**
 * Rendez-vous des véhicules ACTUELLEMENT dans l'UL (un véhicule passé d'une UL à
 * l'autre emporte son rendez-vous). Le garage n'est nommé que s'il est encore visible
 * (contact de l'UL ou partagé) ; `taskId` seulement si la tâche liée existe encore dans l'UL.
 */
async function listUlAppointments(ulId: string, filter: { id?: string; vehicleId?: string } = {}): Promise<ControlAppointment[]> {
    const where: string[] = [];
    const args: string[] = [ulId, ulId];
    if (filter.id) { where.push('a.id = ?'); args.push(filter.id); }
    if (filter.vehicleId) { where.push('a.vehicleId = ?'); args.push(filter.vehicleId); }
    const res = await db.execute({
        sql: `SELECT a.id, a.vehicleId, a.controlType, a.appointmentDate, a.contactId, a.notes,
                     c.name AS contactName, t.id AS liveTaskId
              FROM "FleetControlAppointment" a
              JOIN "Vehicle" v ON v.id = a.vehicleId AND v.ulId = ?
              LEFT JOIN "FleetContact" c ON c.id = a.contactId AND (c.ulId = v.ulId OR c.shared = 1)
              LEFT JOIN "FleetTask" t ON t.id = a.taskId AND t.ulId = ?
              ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
        args,
    });
    return res.rows.flatMap(r => {
        const controlType = toControlType(r.controlType);
        return controlType ? [{
            id: String(r.id),
            vehicleId: String(r.vehicleId),
            controlType,
            appointmentDate: String(r.appointmentDate).slice(0, 10),
            contactId: r.contactId ? String(r.contactId) : null,
            contactName: r.contactName ? String(r.contactName) : null,
            notes: r.notes ? String(r.notes) : null,
            taskId: r.liveTaskId ? String(r.liveTaskId) : null,
        }] : [];
    });
}

/**
 * Lignes « Contrôles » de l'UL (véhicules de l'UL, échéances calculées, rendez-vous) ;
 * `vehicleId` restreint au véhicule (de l'UL) indiqué.
 */
export async function loadUlControls(ulId: string, today: string = parisDay(), vehicleId?: string): Promise<ControlRow[]> {
    const vehicleFilter = vehicleId ? ' AND id = ?' : '';
    const recordFilter = vehicleId ? ' AND v.id = ?' : '';
    const args = vehicleId ? [ulId, vehicleId] : [ulId];
    const [vehiclesRes, recordsRes, appointments] = await Promise.all([
        db.execute({
            sql: `SELECT id, name, plate, type, mileage, firstRegistrationDate, revisionKmInterval, revisionYearInterval,
                         desinfTracking, nextDesinfMaxDate
                  FROM "Vehicle" WHERE ulId = ?${vehicleFilter}`,
            args,
        }),
        db.execute({
            sql: `SELECT r.id, r.vehicleId, r.date, r.type, r.mileage, r.createdAt
                  FROM "VehicleMaintenanceRecord" r JOIN "Vehicle" v ON v.id = r.vehicleId
                  WHERE v.ulId = ?${recordFilter}`,
            args,
        }),
        listUlAppointments(ulId, { vehicleId }),
    ]);
    const vehicles: ControlVehicle[] = vehiclesRes.rows.map(r => ({
        id: String(r.id),
        name: String(r.name),
        plate: r.plate ? String(r.plate) : null,
        type: String(r.type ?? ''),
        mileage: num(r.mileage) ?? 0,
        firstRegistrationDate: r.firstRegistrationDate ? String(r.firstRegistrationDate) : null,
        revisionKmInterval: num(r.revisionKmInterval),
        revisionYearInterval: num(r.revisionYearInterval),
        desinfTracking: Number(r.desinfTracking) === 1,
        nextDesinfMaxDate: r.nextDesinfMaxDate ? String(r.nextDesinfMaxDate) : null,
    }));
    const records: MaintenanceRecord[] = recordsRes.rows.map(r => ({
        id: String(r.id),
        vehicleId: String(r.vehicleId),
        date: String(r.date),
        type: String(r.type) as MaintenanceRecord['type'],
        mileage: num(r.mileage),
        createdAt: String(r.createdAt ?? ''),
    }));
    return computeControls(vehicles, records, appointments, today);
}

export interface AppointmentRow {
    id: string;
    vehicleId: string;
    controlType: string;
    /** UL ACTUELLE du véhicule (`null` s'il n'existe plus) : c'est elle qui possède le rendez-vous. */
    vehicleUlId: string | null;
}

export async function getAppointmentRow(id: string): Promise<AppointmentRow | null> {
    const res = await db.execute({
        sql: `SELECT a.id, a.vehicleId, a.controlType, v.ulId AS vehicleUlId
              FROM "FleetControlAppointment" a LEFT JOIN "Vehicle" v ON v.id = a.vehicleId
              WHERE a.id = ?`,
        args: [id],
    });
    const r = res.rows[0];
    return r ? {
        id: String(r.id), vehicleId: String(r.vehicleId), controlType: String(r.controlType),
        vehicleUlId: r.vehicleUlId ? String(r.vehicleUlId) : null,
    } : null;
}

/** Rendez-vous existant du véhicule (de l'UL) pour ce type, ou `null`. */
export async function getAppointmentFor(ulId: string, vehicleId: string, controlType: ControlType): Promise<ControlAppointment | null> {
    return (await listUlAppointments(ulId, { vehicleId })).find(a => a.controlType === controlType) ?? null;
}

/**
 * Crée ou remplace le rendez-vous du véhicule pour ce type de contrôle (un seul par
 * couple). Le remplacement garde l'identifiant et l'auteur d'origine ; l'UL est
 * réalignée sur celle du véhicule (vérifiée par l'appelant). `taskId` : tâche liée
 * encore existante, `null` sinon. Renvoie l'identifiant.
 */
export async function upsertAppointment(ulId: string, input: AppointmentInput, createdBy: string | null, taskId: string | null): Promise<string> {
    const now = new Date().toISOString();
    const res = await db.execute({
        sql: `INSERT INTO "FleetControlAppointment" (id, ulId, vehicleId, controlType, appointmentDate, contactId, notes, taskId, createdBy, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT ("vehicleId", "controlType") DO UPDATE SET
                  ulId = excluded.ulId,
                  appointmentDate = excluded.appointmentDate,
                  contactId = excluded.contactId,
                  notes = excluded.notes,
                  taskId = excluded.taskId,
                  updatedAt = excluded.updatedAt
              RETURNING id`,
        args: [
            crypto.randomUUID(), ulId, input.vehicleId, input.controlType, input.appointmentDate,
            input.contactId ?? null, input.notes ?? null, taskId, createdBy, now, now,
        ],
    });
    return String(res.rows[0].id);
}

/** Lie au rendez-vous la tâche créée avec lui. */
export async function setAppointmentTask(id: string, taskId: string): Promise<void> {
    await db.execute({ sql: `UPDATE "FleetControlAppointment" SET taskId = ? WHERE id = ?`, args: [taskId, id] });
}

/** Aligne l'échéance de la tâche liée sur la nouvelle date du rendez-vous. */
export async function syncTaskDueDate(taskId: string, ulId: string, dueDate: string): Promise<void> {
    await db.execute({
        sql: `UPDATE "FleetTask" SET dueDate = ?, updatedAt = ? WHERE id = ? AND ulId = ?`,
        args: [dueDate, new Date().toISOString(), taskId, ulId],
    });
}

/** Rendez-vous lu par identifiant, avec le nom du garage visible depuis l'UL. */
export async function getAppointment(id: string, ulId: string): Promise<ControlAppointment | null> {
    return (await listUlAppointments(ulId, { id }))[0] ?? null;
}

/** Supprime le rendez-vous d'un véhicule actuellement dans l'UL ; `false` s'il n'existe plus. */
export async function deleteAppointment(id: string, ulId: string): Promise<boolean> {
    const res = await db.execute({
        sql: `DELETE FROM "FleetControlAppointment" WHERE id = ? AND vehicleId IN (SELECT id FROM "Vehicle" WHERE ulId = ?)`,
        args: [id, ulId],
    });
    return res.rowsAffected > 0;
}
