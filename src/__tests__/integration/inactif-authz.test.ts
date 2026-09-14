/**
 * Tests d'intégration — un compte INACTIF n'exerce aucune autorisation d'API.
 *
 * Pourquoi un fichier dédié : ces routes n'ont rien en commun sauf la faille qu'elles
 * partageaient. Chacune réimplémentait son test de rôle en ligne
 * (`roles.includes('PRESIDENT')`, `roles.includes('TRESORIER')`, …), court-circuitant
 * l'enveloppe `denyWhenInactive` de `src/lib/roles.ts`. Le décompte de la première
 * revue ne pouvait pas les voir : il recensait les routes qui APPELLENT un prédicat,
 * or celles-ci n'en appelaient aucun pour la décision en cause.
 *
 * Rappel du contexte : `/api` est hors du matcher du middleware (`src/proxy.ts:8`),
 * donc la redirection `/inactif` ne protège rien ici. Et le geste normal de blocage
 * produit désormais `['PRESIDENT','INACTIF']` — pas `['INACTIF']` seul — précisément
 * la forme qui franchissait ces tests en ligne.
 *
 * Les regroupements par route restent dans leurs fichiers respectifs ; ici on n'épingle
 * que la dominance d'INACTIF, une assertion par site migré.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/onesignal', () => ({
    sendNotificationToUsers: vi.fn().mockResolvedValue(undefined),
    sendNotificationToRoles: vi.fn().mockResolvedValue(undefined),
    notifyUser: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from '@/auth';
import { GET as getExpenses } from '@/app/api/expenses/route';
import { GET as getExpense, PATCH as patchExpense } from '@/app/api/expenses/[id]/route';
import { GET as getExpenseStats } from '@/app/api/stats/expenses/route';
import { POST as postTrip } from '@/app/api/trips/route';
import { canAccessDriveFolder } from '@/lib/driveAuth';
import { getBorrowEligibility } from '@/lib/vehicleBorrowEligibility';
import { db, seedUser, seedRoles, seedVehicle, seedUniteLocale, seedExpenseReport } from './setup';

const mockedAuth = vi.mocked(auth);

/** Session type-erased : `auth()` renvoie une Session complète en production. */
function asSession(user: Record<string, unknown>) {
    return { user } as never;
}

const UL = 'ul-paris-18';

beforeEach(async () => {
    vi.clearAllMocks();
    await seedRoles();
    await seedUniteLocale({ id: UL, name: 'Paris 18', slug: 'paris-18' });
    await seedUser({ id: 'user-autre', email: 'autre@test.com', name: 'Autre' });
});

describe('Un compte INACTIF n\'exerce aucune autorisation d\'API', () => {
    describe('Notes de frais — isExpenseManager / canPayExpense', () => {
        it('GET /api/expenses : un PRESIDENT inactif ne voit plus les notes de toute l\'UL', async () => {
            // `scope` bascule sur 'ul' pour un manager : c'est la lecture de TOUTES les
            // notes de l'unité locale qui était ouverte au compte bloqué.
            await seedExpenseReport({ id: 'exp-autre', userId: 'user-autre', ulId: UL, status: 'soumis' });

            mockedAuth.mockResolvedValue(asSession({
                id: 'user-bloque', email: 'bloque@test.com', roles: ['PRESIDENT', 'INACTIF'], ulId: UL,
            }));
            const res = await getExpenses(new Request('http://localhost/api/expenses'));

            expect(res.status).toBe(200);
            const body = await res.json();
            const rows = Array.isArray(body) ? body : (body.reports ?? []);
            // Repli sur scope 'my' : aucune note d'autrui.
            expect(rows.some((r: { id: string }) => r.id === 'exp-autre')).toBe(false);
        });

        it('GET /api/expenses/[id] : un PRESIDENT inactif ne lit plus la note d\'autrui', async () => {
            await seedExpenseReport({ id: 'exp-lecture', userId: 'user-autre', ulId: UL, status: 'soumis' });

            mockedAuth.mockResolvedValue(asSession({
                id: 'user-bloque', email: 'bloque@test.com', roles: ['PRESIDENT', 'INACTIF'], ulId: UL,
            }));
            const res = await getExpense(
                new Request('http://localhost/api/expenses/exp-lecture'),
                { params: Promise.resolve({ id: 'exp-lecture' }) },
            );

            expect(res.status).toBe(403);
        });

        it('PATCH /api/expenses/[id] action=pay : un TRESORIER inactif ne marque plus une note payée', async () => {
            // Acte comptable : le site le plus sensible de la liste.
            await seedExpenseReport({
                id: 'exp-paiement', userId: 'user-autre', ulId: UL, status: 'en_attente_paiement',
            });

            mockedAuth.mockResolvedValue(asSession({
                id: 'user-bloque', email: 'bloque@test.com', roles: ['TRESORIER', 'INACTIF'], ulId: UL,
            }));
            const res = await patchExpense(
                new Request('http://localhost/api/expenses/exp-paiement', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'pay' }),
                }),
                { params: Promise.resolve({ id: 'exp-paiement' }) },
            );

            expect(res.status).toBe(403);

            const row = await db.execute({
                sql: 'SELECT status FROM "ExpenseReport" WHERE id = ?',
                args: ['exp-paiement'],
            });
            expect(row.rows[0].status).toBe('en_attente_paiement');
        });

        it('GET /api/stats/expenses : refusé à un PRESIDENT et à un TRESORIER inactifs', async () => {
            for (const roles of [['PRESIDENT', 'INACTIF'], ['TRESORIER', 'INACTIF']]) {
                mockedAuth.mockResolvedValue(asSession({
                    id: 'user-bloque', email: 'bloque@test.com', roles, ulId: UL,
                }));
                const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses'));
                expect(res.status, roles.join('+')).toBe(403);
            }
        });
    });

    describe('Justificatifs Drive — canAccessDriveFolder', () => {
        it('refuse le dossier d\'autrui à un PRESIDENT inactif', async () => {
            await seedExpenseReport({ id: 'exp-drive', userId: 'user-autre', ulId: UL, status: 'soumis' });
            // `seedExpenseReport` n'expose pas driveFolderId : sans cette écriture,
            // resolveDriveFolderOwner ne trouve rien et rend `false` quoi qu'il arrive —
            // le test passerait pour la mauvaise raison.
            await db.execute({
                sql: 'UPDATE "ExpenseReport" SET driveFolderId = ? WHERE id = ?',
                args: ['folder-xyz', 'exp-drive'],
            });

            const autorise = await canAccessDriveFolder(
                asSession({ id: 'user-bloque', email: 'bloque@test.com', roles: ['PRESIDENT', 'INACTIF'], ulId: UL }),
                'folder-xyz',
            );

            expect(autorise).toBe(false);

            // Contre-preuve : le même dossier est bien accessible au PRESIDENT actif.
            // Sans elle, un `false` dû à un dossier introuvable passerait pour un refus.
            const autoriseActif = await canAccessDriveFolder(
                asSession({ id: 'user-actif', email: 'actif@test.com', roles: ['PRESIDENT'], ulId: UL }),
                'folder-xyz',
            );
            expect(autoriseActif).toBe(true);
        });
    });

    describe('Emprunt de véhicule — isChvlDriver / isChvpspDriver', () => {
        it('POST /api/trips : un CHVL inactif ne peut plus emprunter', async () => {
            await seedUser({ id: 'user-bloque', email: 'bloque@test.com', name: 'Bloqué' });
            await seedVehicle({ id: 'VL001', status: 'AVAILABLE', mileage: 1000, fuelLevel: 50, maxFuelCapacity: 50 });

            mockedAuth.mockResolvedValue(asSession({
                id: 'user-bloque', email: 'bloque@test.com', name: 'Bloqué', roles: ['CHVL', 'INACTIF'], ulId: UL,
            }));
            const res = await postTrip(new Request('http://localhost/api/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: 'VL001', missionType: 'LOGISTIQUE', conditionOut: 'BON', dsaChecked: false,
                }),
            }));

            expect(res.status).toBe(403);

            const trips = await db.execute({ sql: 'SELECT id FROM Trip WHERE vehicleId = ?', args: ['VL001'] });
            expect(trips.rows).toHaveLength(0);
        });

        it('getBorrowEligibility refuse un CHVL inactif', async () => {
            const entree = {
                vehicleType: 'VL',
                vehicleStatus: 'AVAILABLE',
                isReservedByOther: false,
                licenseBlocked: false,
            };

            expect(getBorrowEligibility({ ...entree, userRoles: ['CHVL', 'INACTIF'] }).canBorrow).toBe(false);
            // Contre-preuve : le même véhicule reste empruntable par un CHVL actif.
            expect(getBorrowEligibility({ ...entree, userRoles: ['CHVL'] }).canBorrow).toBe(true);
        });
    });
});
