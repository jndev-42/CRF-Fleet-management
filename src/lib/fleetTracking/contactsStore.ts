import type { Row } from '@libsql/client';
import { db } from '@/lib/db';
import {
    CONTACT_CATEGORIES,
    parsePhones,
    type ContactCategory,
    type CreateContactInput,
    type FleetContact,
    type UpdateContactInput,
} from './contacts';

/**
 * Accès base des contacts prestataires. Le cloisonnement (UL de session, UL
 * propriétaire) est décidé par les routes ; ce module ne fait qu'exécuter.
 */

const COLUMNS = `c.id, c.ulId, c.name, c.category, c.phones, c.email, c.address, c.notes, c.shared, c.updatedAt`;

function toContact(row: Row, withUlName = false): FleetContact {
    const category = String(row.category);
    const contact: FleetContact = {
        id: String(row.id),
        ulId: String(row.ulId),
        name: String(row.name),
        category: (CONTACT_CATEGORIES as readonly string[]).includes(category) ? category as ContactCategory : 'AUTRE',
        phones: parsePhones(row.phones),
        email: (row.email as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        shared: Number(row.shared) === 1,
        updatedAt: String(row.updatedAt),
    };
    if (withUlName) contact.ulName = (row.ulName as string | null) ?? '';
    return contact;
}

/**
 * Contacts visibles pour l'UL `ulId` : les siens (partagés ou non) et ceux que les
 * autres UL partagent, avec le nom de leur UL. Triés par nom.
 */
export async function listVisibleContacts(ulId: string): Promise<{ own: FleetContact[]; shared: FleetContact[] }> {
    const [ownRes, sharedRes] = await Promise.all([
        db.execute({
            sql: `SELECT ${COLUMNS} FROM "FleetContact" c WHERE c.ulId = ? ORDER BY c.name COLLATE NOCASE, c.id`,
            args: [ulId],
        }),
        db.execute({
            sql: `SELECT ${COLUMNS}, u.name AS ulName
                  FROM "FleetContact" c
                  INNER JOIN "UniteLocale" u ON u.id = c.ulId
                  WHERE c.shared = 1 AND c.ulId <> ?
                  ORDER BY c.name COLLATE NOCASE, c.id`,
            args: [ulId],
        }),
    ]);
    return {
        own: ownRes.rows.map(r => toContact(r)),
        shared: sharedRes.rows.map(r => toContact(r, true)),
    };
}

export async function getContact(id: string): Promise<FleetContact | null> {
    const res = await db.execute({ sql: `SELECT ${COLUMNS} FROM "FleetContact" c WHERE c.id = ?`, args: [id] });
    return res.rows[0] ? toContact(res.rows[0]) : null;
}

export async function createContact(ulId: string, input: CreateContactInput, createdBy: string | null): Promise<FleetContact> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO "FleetContact" (id, ulId, name, category, phones, email, address, notes, shared, createdBy, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            id, ulId, input.name, input.category, JSON.stringify(input.phones),
            input.email ?? null, input.address ?? null, input.notes ?? null,
            input.shared ? 1 : 0, createdBy, now, now,
        ],
    });
    const created = await getContact(id);
    if (!created) throw new Error('Contact créé introuvable');
    return created;
}

/**
 * Modification partielle : seuls les champs présents sont écrits. Gardée par l'UL
 * propriétaire ; `null` si le contact n'existe plus (supprimé entre-temps).
 */
export async function updateContact(id: string, ulId: string, input: UpdateContactInput): Promise<FleetContact | null> {
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => {
        sets.push(`"${column}" = ?`);
        args.push(value);
    };
    if (input.name !== undefined) set('name', input.name);
    if (input.category !== undefined) set('category', input.category);
    if (input.phones !== undefined) set('phones', JSON.stringify(input.phones));
    if (input.email !== undefined) set('email', input.email);
    if (input.address !== undefined) set('address', input.address);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.shared !== undefined) set('shared', input.shared ? 1 : 0);
    set('updatedAt', new Date().toISOString());
    const res = await db.execute({
        sql: `UPDATE "FleetContact" SET ${sets.join(', ')} WHERE id = ? AND ulId = ?`,
        args: [...args, id, ulId],
    });
    if (res.rowsAffected === 0) return null;
    return getContact(id);
}

/** Suppression gardée par l'UL propriétaire ; `false` si rien n'a été supprimé. */
export async function deleteContact(id: string, ulId: string): Promise<boolean> {
    const res = await db.execute({ sql: `DELETE FROM "FleetContact" WHERE id = ? AND ulId = ?`, args: [id, ulId] });
    return res.rowsAffected > 0;
}

export async function getUlName(ulId: string): Promise<string | null> {
    const res = await db.execute({ sql: `SELECT name FROM "UniteLocale" WHERE id = ?`, args: [ulId] });
    return (res.rows[0]?.name as string | undefined) ?? null;
}
