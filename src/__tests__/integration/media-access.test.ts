/**
 * Tests d'intégration — src/lib/media/access.ts (resolveFolderOwner, canAccessFolder, canAccessSignedReport, canAccessMediaKey).
 * DB réelle (pas de mock), pas de session NextAuth réelle nécessaire (Session passée en argument direct).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Session } from 'next-auth';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { resolveFolderOwner, canAccessFolder, canAccessSignedReport, canAccessMediaKey } from '@/lib/media/access';
import { db, seedVehicle, seedUser, seedTrip, seedIncident, seedExpenseReport } from './setup';

const TRIP_REF = 'trip-photos/paris-18/vl186-20261101-100000-a1b2';
const INCIDENT_REF = 'incident-photos/paris-18/vl186-20261101-100000-a1b2';
const EXPENSE_REF = 'trip-photos/paris-18/ndf-20261101-100000-a1b2';
const MISSION_REF = 'mission-com-photos/paris-18/dps-20261001-100000-a1b2';
const SIGNED_KEY = 'mission-report-photo/paris-18/dps-20261001-100000-c3d4/0a1b2c3d-rapport.pdf';
const UNKNOWN_REF = 'trip-photos/paris-18/inconnu-20261101-100000-ffff';
const UNKNOWN_KEY = 'mission-report-photo/paris-18/inconnu-20261001-100000-ffff/0a1b2c3d-x.pdf';

function makeSession(overrides: Partial<Session['user']> = {}): Session {
    return {
        user: { id: 'user-1', email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18', ...overrides },
        expires: new Date(Date.now() + 3600_000).toISOString(),
    } as Session;
}

describe('resolveFolderOwner', () => {
    it('retourne null pour un dossier inconnu', async () => {
        const owner = await resolveFolderOwner(UNKNOWN_REF);
        expect(owner).toBeNull();
    });

    it('résout un dossier de Trip via le véhicule', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [TRIP_REF, 'trip-1'] });

        const owner = await resolveFolderOwner(TRIP_REF);
        expect(owner).toEqual({ kind: 'trip', ulId: 'ul-paris-18' });
    });

    it('résout un dossier de IncidentReport via le véhicule', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });
        await db.execute({ sql: `UPDATE "IncidentReport" SET driveFolderId = ? WHERE id = ?`, args: [INCIDENT_REF, 'incident-1'] });

        const owner = await resolveFolderOwner(INCIDENT_REF);
        expect(owner).toEqual({ kind: 'incident', ulId: 'ul-paris-18' });
    });

    it('une note de frais n\'est jamais propriétaire d\'un dossier média', async () => {
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', ulId: 'ul-paris-18', status: 'soumis' });
        await db.execute({ sql: `UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?`, args: [EXPENSE_REF, 'expense-1'] });

        expect(await resolveFolderOwner(EXPENSE_REF)).toBeNull();
        expect(await canAccessFolder(makeSession({ id: 'user-1' }), EXPENSE_REF)).toBe(false);
    });
});

describe('canAccessFolder', () => {
    it('refuse par défaut si le dossier n\'est rattaché à aucun enregistrement', async () => {
        const allowed = await canAccessFolder(makeSession(), UNKNOWN_REF);
        expect(allowed).toBe(false);
    });

    it('autorise un SUPER_ADMIN sans vérification', async () => {
        const allowed = await canAccessFolder(makeSession({ roles: ['SUPER_ADMIN'], ulId: 'ul-lyon-3' }), UNKNOWN_REF);
        expect(allowed).toBe(true);
    });

    it('autorise un utilisateur de la même UL pour un trajet', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [TRIP_REF, 'trip-1'] });

        const allowed = await canAccessFolder(makeSession({ ulId: 'ul-paris-18' }), TRIP_REF);
        expect(allowed).toBe(true);
    });

    it('refuse un utilisateur hors UL pour un trajet', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [TRIP_REF, 'trip-1'] });

        const allowed = await canAccessFolder(makeSession({ ulId: 'ul-lyon-3' }), TRIP_REF);
        expect(allowed).toBe(false);
    });

    it('refuse un compte INACTIF de la même UL (trajet, incident, compte rendu, rapport signé)', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [TRIP_REF, 'trip-1'] });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });
        await db.execute({ sql: `UPDATE "IncidentReport" SET driveFolderId = ? WHERE id = ?`, args: [INCIDENT_REF, 'incident-1'] });
        await seedMissionReport({ id: 'mr-inactif', submittedBy: 'author-1', ulId: 'ul-paris-18', folderId: MISSION_REF, signedId: SIGNED_KEY });

        const inactive = makeSession({ ulId: 'ul-paris-18', roles: ['CADRE', 'INACTIF'] });
        expect(await canAccessFolder(inactive, TRIP_REF)).toBe(false);
        expect(await canAccessFolder(inactive, INCIDENT_REF)).toBe(false);
        expect(await canAccessFolder(inactive, MISSION_REF)).toBe(false);
        expect(await canAccessSignedReport(inactive, SIGNED_KEY)).toBe(false);
        expect(await canAccessMediaKey(inactive, `${TRIP_REF}/emprunt/0a1b2c3d-photo.jpg`)).toBe(false);
        // Témoins : le même compte sans INACTIF lit chacun de ces fichiers (le refus vient bien d'INACTIF).
        const active = makeSession({ ulId: 'ul-paris-18', roles: ['CADRE'] });
        expect(await canAccessFolder(active, TRIP_REF)).toBe(true);
        expect(await canAccessFolder(active, INCIDENT_REF)).toBe(true);
        expect(await canAccessFolder(active, MISSION_REF)).toBe(true);
        expect(await canAccessSignedReport(active, SIGNED_KEY)).toBe(true);
    });
});

async function seedMissionReport(opts: { id: string; submittedBy: string; ulId: string | null; folderId?: string; signedId?: string }) {
    await db.execute({
        sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, ulId, drive_folder_id, signed_report_drive_id)
              VALUES (?, ?, '2026-10-01T10:00:00Z', 'DPS', 'DPS Test', '2026-10-01', 'Paris', '[]', ?, ?, ?)`,
        args: [opts.id, opts.submittedBy, opts.ulId, opts.folderId ?? null, opts.signedId ?? null],
    });
}

describe('Comptes rendus de mission', () => {
    it('résout le dossier photos d\'un compte rendu', async () => {
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', folderId: MISSION_REF });

        const owner = await resolveFolderOwner(MISSION_REF);
        expect(owner).toEqual({ kind: 'mission', reports: [{ ulId: 'ul-paris-18', submittedBy: 'author-1' }] });
    });

    it('autorise un responsable lecture seule de la même UL (dossier et rapport signé)', async () => {
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', folderId: MISSION_REF, signedId: SIGNED_KEY });
        const session = makeSession({ id: 'reader-1', email: 'reader@test.com', roles: ['CADRE'], ulId: 'ul-paris-18' });

        expect(await canAccessFolder(session, MISSION_REF)).toBe(true);
        expect(await canAccessSignedReport(session, SIGNED_KEY)).toBe(true);
    });

    it('autorise un ADMIN de la même UL', async () => {
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', signedId: SIGNED_KEY });

        expect(await canAccessSignedReport(makeSession({ id: 'admin-1', email: 'admin@test.com', roles: ['ADMIN'] }), SIGNED_KEY)).toBe(true);
    });

    it('autorise l\'auteur, même hors UL', async () => {
        await seedUser({ id: 'author-1', email: 'author@test.com' });
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: null, signedId: SIGNED_KEY });

        const session = makeSession({ id: 'author-1', email: 'author@test.com', roles: ['CI/RPAPS'], ulId: 'ul-lyon-3' });
        expect(await canAccessSignedReport(session, SIGNED_KEY)).toBe(true);
    });

    it('refuse un responsable d\'une autre UL', async () => {
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', folderId: MISSION_REF, signedId: SIGNED_KEY });
        const session = makeSession({ id: 'reader-1', email: 'reader@test.com', roles: ['CADRE'], ulId: 'ul-lyon-3' });

        expect(await canAccessFolder(session, MISSION_REF)).toBe(false);
        expect(await canAccessSignedReport(session, SIGNED_KEY)).toBe(false);
    });

    it('refuse un simple utilisateur de la même UL qui n\'est pas l\'auteur', async () => {
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', signedId: SIGNED_KEY });

        expect(await canAccessSignedReport(makeSession({ id: 'user-2', email: 'u2@test.com', roles: ['CHVL'] }), SIGNED_KEY)).toBe(false);
    });

    it('refuse un fichier qui n\'est le rapport signé d\'aucun compte rendu', async () => {
        expect(await canAccessSignedReport(makeSession({ roles: ['ADMIN'] }), UNKNOWN_KEY)).toBe(false);
    });
});

describe('Références R2 (préfixe et clé)', () => {
    const tripRef = 'trip-photos/paris-18/vl186-20261108-143000-a1b2';

    async function seedTripWithRef() {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [tripRef, 'trip-1'] });
    }

    it('resolveFolderOwner : résolution d\'un préfixe R2', async () => {
        await seedTripWithRef();
        expect(await resolveFolderOwner(tripRef)).toEqual({ kind: 'trip', ulId: 'ul-paris-18' });
        expect(await canAccessFolder(makeSession({ ulId: 'ul-paris-18' }), tripRef)).toBe(true);
        expect(await canAccessFolder(makeSession({ ulId: 'ul-lyon-3' }), tripRef)).toBe(false);
    });

    it('canAccessMediaKey : appariement sur les 3 premiers segments de la clé', async () => {
        await seedTripWithRef();
        expect(await canAccessMediaKey(makeSession(), `${tripRef}/emprunt/0a1b2c3d-x.jpg`)).toBe(true);
        expect(await canAccessMediaKey(makeSession({ ulId: 'ul-lyon-3' }), `${tripRef}/emprunt/0a1b2c3d-x.jpg`)).toBe(false);
        expect(await canAccessMediaKey(makeSession(), 'trip-photos/paris-18/autre-dossier/emprunt/0a1b2c3d-x.jpg')).toBe(false);
    });

    it('canAccessMediaKey : clé forgée refusée, même pour un SUPER_ADMIN', async () => {
        const superAdmin = makeSession({ roles: ['SUPER_ADMIN'] });
        expect(await canAccessMediaKey(superAdmin, '../x')).toBe(false);
        expect(await canAccessMediaKey(superAdmin, 'ndf/paris-18/x/note-de-frais.pdf')).toBe(false);
        expect(await canAccessMediaKey(superAdmin, `${tripRef}/emprunt/0a1b2c3d-x.jpg`)).toBe(true);
    });

    it('rapport signé : appariement sur la clé EXACTE', async () => {
        const key = 'mission-report-photo/paris-18/dps-20261108-143000-a1b2/0a1b2c3d-rapport.pdf';
        await seedMissionReport({ id: 'mr-1', submittedBy: 'author-1', ulId: 'ul-paris-18', signedId: key });
        const reader = makeSession({ id: 'reader-1', email: 'reader@test.com', roles: ['CADRE'], ulId: 'ul-paris-18' });

        expect(await canAccessMediaKey(reader, key)).toBe(true);
        expect(await canAccessMediaKey(reader, 'mission-report-photo/paris-18/dps-20261108-143000-a1b2/ffffffff-autre.pdf')).toBe(false);
    });
});
