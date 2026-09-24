import { isAdminOrAbove, isSuperAdmin } from './roles';

/**
 * Visibilités possibles d'un menu (table `MenuSetting`).
 *
 * Source unique : la route PATCH, l'onglet d'administration et le contrôle
 * d'affichage lisent cette liste — une valeur ajoutée ici sans migration de la
 * contrainte CHECK de `MenuSetting` ferait échouer l'écriture en base
 * (cf. `scripts/update-menu-settings.ts`).
 */
export const MENU_VISIBILITIES = ['available', 'admin_only', 'super_admin_only', 'disabled'] as const;

export type MenuVisibility = (typeof MENU_VISIBILITIES)[number];

/** Menus dont la visibilité est réglable depuis Administration → Menus. */
export const MENU_KEYS = ['expenses', 'stats', 'inventory', 'missions', 'uniforms'] as const;

export type MenuKey = (typeof MENU_KEYS)[number];

/**
 * Le réglage de visibilité autorise-t-il ce compte à voir le menu ?
 *
 * Ne remplace pas les conditions de rôle propres à chaque menu (ex. Inventaire
 * réservé aux gestionnaires) : il s'y ajoute. Les prédicats de `roles.ts`
 * refusent déjà tout compte INACTIF.
 */
export function canSeeMenu(visibility: MenuVisibility, roles: string[]): boolean {
    switch (visibility) {
        case 'disabled': return false;
        case 'super_admin_only': return isSuperAdmin(roles);
        case 'admin_only': return isAdminOrAbove(roles);
        default: return true;
    }
}
