/**
 * Tests d'intégration — src/lib/driveAuth.ts (resolveDriveFolderOwner, canAccessDriveFolder).
 * DB réelle (pas de mock), pas de session NextAuth réelle nécessaire (Session passée en argument direct).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Session } from 'next-auth';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { resolveDriveFolderOwner, canAccessDriveFolder } from '@/lib/driveAuth';
import { db, seedVehicle, seedUser, seedTrip, seedIncident, seedExpenseReport } from './setup';

function makeSession(overrides: Partial<Session['user']> = {}): Session {
    return {
        user: { id: 'user-1', email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18', ...overrides },
        expires: new Date(Date.now() + 3600_000).toISOString(),
    } as Session;
}

describe('resolveDriveFolderOwner', () => {
    it('retourne null pour un dossier inconnu', async () => {
        const owner = await resolveDriveFolderOwner('unknown-folder');
        expect(owner).toBeNull();
    });

    it('résout un dossier de Trip via le véhicule', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: ['folder-trip', 'trip-1'] });

        const owner = await resolveDriveFolderOwner('folder-trip');
        expect(owner).toEqual({ kind: 'trip', ulId: 'ul-paris-18' });
    });

    it('résout un dossier de IncidentReport via le véhicule', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });
        await db.execute({ sql: `UPDATE "IncidentReport" SET driveFolderId = ? WHERE id = ?`, args: ['folder-incident', 'incident-1'] });

        const owner = await resolveDriveFolderOwner('folder-incident');
        expect(owner).toEqual({ kind: 'incident', ulId: 'ul-paris-18' });
    });

    it('résout un dossier de ExpenseReport', async () => {
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', ulId: 'ul-paris-18', status: 'soumis' });
        await db.execute({ sql: `UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?`, args: ['folder-expense', 'expense-1'] });

        const owner = await resolveDriveFolderOwner('folder-expense');
        expect(owner).toEqual({ kind: 'expense', ulId: 'ul-paris-18', userId: 'user-1', status: 'soumis' });
    });
});

describe('canAccessDriveFolder', () => {
    it('refuse par défaut si le dossier n\'est rattaché à aucun enregistrement', async () => {
        const allowed = await canAccessDriveFolder(makeSession(), 'unknown-folder');
        expect(allowed).toBe(false);
    });

    it('autorise un SUPER_ADMIN sans vérification', async () => {
        const allowed = await canAccessDriveFolder(makeSession({ roles: ['SUPER_ADMIN'], ulId: 'ul-lyon-3' }), 'unknown-folder');
        expect(allowed).toBe(true);
    });

    it('autorise un utilisateur de la même UL pour un trajet', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: ['folder-trip', 'trip-1'] });

        const allowed = await canAccessDriveFolder(makeSession({ ulId: 'ul-paris-18' }), 'folder-trip');
        expect(allowed).toBe(true);
    });

    it('refuse un utilisateur hors UL pour un trajet', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: ['folder-trip', 'trip-1'] });

        const allowed = await canAccessDriveFolder(makeSession({ ulId: 'ul-lyon-3' }), 'folder-trip');
        expect(allowed).toBe(false);
    });

    it('autorise le propriétaire d\'une note de frais', async () => {
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', ulId: 'ul-paris-18', status: 'soumis' });
        await db.execute({ sql: `UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?`, args: ['folder-expense', 'expense-1'] });

        const allowed = await canAccessDriveFolder(makeSession({ id: 'user-1', ulId: 'ul-lyon-3' }), 'folder-expense');
        expect(allowed).toBe(true);
    });

    it('autorise le trésorier pour une note en attente de paiement', async () => {
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', ulId: 'ul-paris-18', status: 'en_attente_paiement' });
        await db.execute({ sql: `UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?`, args: ['folder-expense', 'expense-1'] });

        const allowed = await canAccessDriveFolder(makeSession({ id: 'user-2', roles: ['TRESORIER'] }), 'folder-expense');
        expect(allowed).toBe(true);
    });

    it('refuse un autre utilisateur non-manager/trésorier pour une note de frais', async () => {
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', ulId: 'ul-paris-18', status: 'soumis' });
        await db.execute({ sql: `UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?`, args: ['folder-expense', 'expense-1'] });

        const allowed = await canAccessDriveFolder(makeSession({ id: 'user-2', roles: ['CHVL'] }), 'folder-expense');
        expect(allowed).toBe(false);
    });
});
