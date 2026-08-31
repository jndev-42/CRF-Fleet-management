import { describe, it, expect } from 'vitest';
import {
    isSuperAdmin,
    isAdmin,
    isAdminOrAbove,
    isReadOnlyManager,
    canAccessAdminPanel,
    canManageExpenseBudgets,
    isDriverRole,
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
});
