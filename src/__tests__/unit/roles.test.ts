import { describe, it, expect } from 'vitest';
import {
    isSuperAdmin,
    isAdmin,
    isAdminOrAbove,
    isReadOnlyManager,
    canAccessAdminPanel,
    isDriverRole,
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
