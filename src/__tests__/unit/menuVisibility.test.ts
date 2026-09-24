import { describe, it, expect } from 'vitest';
import { canSeeMenu, MENU_KEYS, MENU_VISIBILITIES } from '@/lib/menuVisibility';

describe('canSeeMenu', () => {
    it('available : visible pour tous', () => {
        expect(canSeeMenu('available', ['CHVL'])).toBe(true);
        expect(canSeeMenu('available', [])).toBe(true);
    });

    it('disabled : masqué pour tous, SUPER_ADMIN compris', () => {
        expect(canSeeMenu('disabled', ['SUPER_ADMIN'])).toBe(false);
    });

    it('admin_only : ADMIN et SUPER_ADMIN, pas CADRE/PRESIDENT', () => {
        expect(canSeeMenu('admin_only', ['ADMIN'])).toBe(true);
        expect(canSeeMenu('admin_only', ['SUPER_ADMIN'])).toBe(true);
        expect(canSeeMenu('admin_only', ['CADRE'])).toBe(false);
        expect(canSeeMenu('admin_only', ['PRESIDENT'])).toBe(false);
    });

    it('super_admin_only : SUPER_ADMIN seulement', () => {
        expect(canSeeMenu('super_admin_only', ['SUPER_ADMIN'])).toBe(true);
        expect(canSeeMenu('super_admin_only', ['ADMIN'])).toBe(false);
    });

    it('un compte portant INACTIF ne voit aucun menu réservé', () => {
        expect(canSeeMenu('admin_only', ['ADMIN', 'INACTIF'])).toBe(false);
        expect(canSeeMenu('super_admin_only', ['SUPER_ADMIN', 'INACTIF'])).toBe(false);
    });
});

describe('listes de référence', () => {
    it('contiennent Frais et l\'option super admin', () => {
        expect(MENU_KEYS).toContain('expenses');
        expect(MENU_VISIBILITIES).toContain('super_admin_only');
    });
});
