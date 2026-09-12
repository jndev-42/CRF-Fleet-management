import { describe, it, expect } from 'vitest';
import {
    isSuperAdmin,
    isAdmin,
    isAdminOrAbove,
    isReadOnlyManager,
    canAccessAdminPanel,
    canManageExpenseBudgets,
    isDriverRole,
    isInactive,
    isQrBlocked,
    resolveRoles,
    ROLES,
} from '@/lib/roles';

describe('Roles helper functions', () => {
    describe('isReadOnlyManager', () => {
        it('returns true for pure CADRE or PRESIDENT', () => {
            expect(isReadOnlyManager(['CADRE'])).toBe(true);
            expect(isReadOnlyManager(['PRESIDENT'])).toBe(true);
        });

        it('returns false when user has elevated admin roles (SUPER_ADMIN or ADMIN)', () => {
            expect(isReadOnlyManager(['SUPER_ADMIN', 'CADRE'])).toBe(false);
            expect(isReadOnlyManager(['ADMIN', 'CADRE'])).toBe(false);
            expect(isReadOnlyManager(['SUPER_ADMIN', 'ADMIN', 'CADRE', 'CHVL', 'CI/RPAPS'])).toBe(false);
        });

        it('returns false for pure driver or CI/RPAPS', () => {
            expect(isReadOnlyManager(['CHVL'])).toBe(false);
            expect(isReadOnlyManager(['CI/RPAPS'])).toBe(false);
        });
    });

    describe('canManageExpenseBudgets', () => {
        // Matrice complète des 10 rôles gérables (MANAGEABLE_ROLES).
        const AUTHORIZED = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRESIDENT, ROLES.TRESORIER, ROLES.CADRE];
        const DENIED = [ROLES.DT, ROLES.CHVPSP, ROLES.CHVL, ROLES.CI_RPAPS, ROLES.INACTIF];

        it('canManageExpenseBudgets autorise CADRE, PRESIDENT, TRESORIER, ADMIN, SUPER_ADMIN et refuse CHVL, CHVPSP, DT, CI/RPAPS, INACTIF', () => {
            for (const role of AUTHORIZED) {
                expect(canManageExpenseBudgets([role]), `${role} devrait être autorisé`).toBe(true);
            }
            for (const role of DENIED) {
                expect(canManageExpenseBudgets([role]), `${role} devrait être refusé`).toBe(false);
            }
        });

        it('returns false for an empty role list (deny-by-default)', () => {
            expect(canManageExpenseBudgets([])).toBe(false);
        });

        it('returns true as soon as one authorized role is present among denied ones', () => {
            expect(canManageExpenseBudgets(['CHVL', 'TRESORIER'])).toBe(true);
            expect(canManageExpenseBudgets(['INACTIF', 'CADRE'])).toBe(true);
            expect(canManageExpenseBudgets(['CHVL', 'CHVPSP', 'CI/RPAPS'])).toBe(false);
        });

        it('authorizes admins, unlike isReadOnlyManager', () => {
            // Garde-fou : le helper ne doit jamais être dérivé d'isReadOnlyManager,
            // dont la clause `&& !isAdminOrAbove` exclut les administrateurs.
            expect(isReadOnlyManager(['ADMIN', 'CADRE'])).toBe(false);
            expect(canManageExpenseBudgets(['ADMIN', 'CADRE'])).toBe(true);
        });

        it('authorizes TRESORIER, unlike canAccessAdminPanel', () => {
            // Garde-fou : TRESORIER n'ouvre pas le panneau d'administration mais
            // gère bien les budgets analytiques.
            expect(canAccessAdminPanel(['TRESORIER'])).toBe(false);
            expect(canManageExpenseBudgets(['TRESORIER'])).toBe(true);
        });
    });

    describe('Multi-role authorization check for user scenario', () => {
        const userRoles = ['SUPER_ADMIN', 'ADMIN', 'CADRE', 'CHVL', 'CI/RPAPS'];

        it('identifies as admin or above', () => {
            expect(isAdminOrAbove(userRoles)).toBe(true);
            expect(isSuperAdmin(userRoles)).toBe(true);
            expect(isAdmin(userRoles)).toBe(true);
        });

        it('identifies as driver', () => {
            expect(isDriverRole(userRoles)).toBe(true);
        });

        it('allows admin panel access', () => {
            expect(canAccessAdminPanel(userRoles)).toBe(true);
        });

        it('evaluates mission report creation permission correctly (isAdminOrAbove || CI/RPAPS)', () => {
            const canCreate = isAdminOrAbove(userRoles) || userRoles.includes('CI/RPAPS');
            expect(canCreate).toBe(true);

            const cadreOnly = ['CADRE'];
            const cadreCanCreate = isAdminOrAbove(cadreOnly) || cadreOnly.includes('CI/RPAPS');
            expect(cadreCanCreate).toBe(false);
        });
    });

    // ── Dominance d'INACTIF (Question E) et accès QR (Question D) ─────────────

    describe('isQrBlocked', () => {
        it('autorise une liste de rôles vide — divergence VOULUE avec isInactive', () => {
            // Un bénévole pas encore qualifié doit pouvoir déclarer un mouvement
            // ou rendre un véhicule depuis un QR code.
            expect(isQrBlocked([])).toBe(false);
            expect(isInactive([])).toBe(true);
        });

        it('autorise un rôle actif', () => {
            expect(isQrBlocked(['CHVL'])).toBe(false);
        });

        it('refuse INACTIF, y compris en cumul et quel que soit l\'ordre', () => {
            expect(isQrBlocked(['INACTIF'])).toBe(true);
            expect(isQrBlocked(['INACTIF', 'CHVL'])).toBe(true);
            expect(isQrBlocked(['CHVL', 'INACTIF'])).toBe(true);
        });

        it('refuse la valeur héritée GUEST', () => {
            expect(isQrBlocked(['GUEST'])).toBe(true);
            expect(isQrBlocked(['CHVL', 'GUEST'])).toBe(true);
        });
    });

    describe('isInactive', () => {
        it('reste vrai pour une liste vide (deny-by-default inchangé)', () => {
            expect(isInactive([])).toBe(true);
        });

        it('est faux pour des rôles actifs seuls', () => {
            expect(isInactive(['CHVL'])).toBe(false);
            expect(isInactive(['ADMIN', 'CHVL'])).toBe(false);
        });

        it('est ABSORBANT : INACTIF cumulé à un rôle actif bloque, dans les deux ordres', () => {
            expect(isInactive(['INACTIF', 'CHVL'])).toBe(true);
            expect(isInactive(['CHVL', 'INACTIF'])).toBe(true);
        });

        it('traite GUEST comme INACTIF', () => {
            expect(isInactive(['GUEST'])).toBe(true);
            expect(isInactive(['GUEST', 'CHVL'])).toBe(true);
        });
    });

    describe('insensibilité à l\'ordre des prédicats', () => {
        // `some` la garantit par construction ; l'assertion est une garde contre une
        // réécriture ultérieure qui inspecterait roles[0] ou s'arrêterait au premier
        // rôle actif rencontré.
        const permutations: string[][] = [
            ['INACTIF', 'CHVL', 'ADMIN'],
            ['CHVL', 'INACTIF', 'ADMIN'],
            ['ADMIN', 'CHVL', 'INACTIF'],
        ];

        it('isInactive et isQrBlocked rendent le même booléen pour toute permutation', () => {
            for (const roles of permutations) {
                expect(isInactive(roles), `isInactive(${roles.join('+')})`).toBe(true);
                expect(isQrBlocked(roles), `isQrBlocked(${roles.join('+')})`).toBe(true);
            }
        });
    });

    describe('resolveRoles', () => {
        it('PRÉSERVE INACTIF aux côtés des rôles actifs, dans l\'ordre reçu', () => {
            // Le stockage enregistre ce que l'administrateur a coché ; c'est le runtime
            // qui en tire le blocage. Décocher INACTIF doit restituer le CHVL.
            expect(resolveRoles(['INACTIF', 'CHVL'])).toEqual(['INACTIF', 'CHVL']);
            expect(resolveRoles(['CHVL', 'INACTIF'])).toEqual(['CHVL', 'INACTIF']);
        });

        it('normalise GUEST → INACTIF sans écarter les rôles actifs', () => {
            expect(resolveRoles(['GUEST', 'CHVL'])).toEqual(['INACTIF', 'CHVL']);
        });

        it('réduit à [INACTIF] quand aucun rôle actif ne subsiste', () => {
            expect(resolveRoles(['GUEST'])).toEqual(['INACTIF']);
            expect(resolveRoles(['INACTIF'])).toEqual(['INACTIF']);
        });

        it('laisse intacts les rôles actifs seuls et la liste vide', () => {
            expect(resolveRoles(['CHVL'])).toEqual(['CHVL']);
            expect(resolveRoles([])).toEqual([]);
        });

        it('déduplique le doublon produit par la normalisation GUEST → INACTIF', () => {
            expect(resolveRoles(['GUEST', 'INACTIF', 'CHVL'])).toEqual(['INACTIF', 'CHVL']);
        });
    });
});
