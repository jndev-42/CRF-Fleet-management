import { describe, it, expect } from 'vitest';
import {
    isSuperAdmin,
    isAdmin,
    isAdminOrAbove,
    isReadOnlyManager,
    canAccessAdminPanel,
    canManageExpenseBudgets,
    isDriverRole,
    hasDTRole,
    isTresorier,
    isPresident,
    isExpenseManager,
    canValidateExpenseAsRespo,
    canManageVehicles,
    canManageUniforms,
    canSuperviseVehicles,
    canManageReservations,
    canViewStatsPage,
    canAssignRole,
    MANAGEABLE_ROLES,
    isInactive,
    isQrBlocked,
    resolveRoles,
    ROLES,
} from '@/lib/roles';
import * as rolesModule from '@/lib/roles';

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
        // Matrice complète des 13 rôles gérables (MANAGEABLE_ROLES).
        const AUTHORIZED = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRESIDENT, ROLES.TRESORIER, ROLES.CADRE];
        const DENIED = [ROLES.RESPO, ROLES.RESP_VEHICULE, ROLES.RESP_UNIFORME, ROLES.DT, ROLES.CHVPSP, ROLES.CHVL, ROLES.CI_RPAPS, ROLES.INACTIF];

        it('couvre tous les rôles gérables', () => {
            expect([...AUTHORIZED, ...DENIED].sort()).toEqual([...MANAGEABLE_ROLES].sort());
        });

        it('canManageExpenseBudgets autorise CADRE, PRESIDENT, TRESORIER, ADMIN, SUPER_ADMIN et refuse RESPO, RESP_VEHICULE, RESP_UNIFORME, CHVL, CHVPSP, DT, CI/RPAPS, INACTIF', () => {
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
            // Le cas de cumul portait auparavant sur ['INACTIF','CADRE'] : il encodait
            // la règle d'AVANT, où INACTIF était un rôle refusé comme un autre, qu'un
            // rôle autorisé écrasait. INACTIF est désormais ABSORBANT — il bloque au
            // lieu d'être écrasé. Le cumul est reformulé sur un rôle réellement refusé
            // (CHVPSP), pour que le test continue de dire ce qu'il voulait dire.
            expect(canManageExpenseBudgets(['CHVPSP', 'CADRE'])).toBe(true);
            expect(canManageExpenseBudgets(['INACTIF', 'CADRE'])).toBe(false);
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

    describe('Rôle RESPO — responsable d\'activité (notes de frais uniquement)', () => {
        it('est déclaré, gérable et libellé', () => {
            expect(ROLES.RESPO).toBe('RESPO');
            expect(MANAGEABLE_ROLES).toContain(ROLES.RESPO);
            expect(rolesModule.ROLE_LABELS[ROLES.RESPO]).toMatch(/Responsable/);
        });

        it('canValidateExpenseAsRespo : RESPO, PRESIDENT et SUPER_ADMIN, personne d\'autre', () => {
            const autorises: string[] = [ROLES.RESPO, ROLES.PRESIDENT, ROLES.SUPER_ADMIN];
            for (const role of MANAGEABLE_ROLES) {
                expect(canValidateExpenseAsRespo([role]), role).toBe(autorises.includes(role));
            }
        });

        it('le RESPO n\'agit pas à l\'étape président', () => {
            expect(isExpenseManager(['RESPO'])).toBe(false);
            expect(isExpenseManager(['RESPO', 'PRESIDENT'])).toBe(true);
        });

        it('n\'ouvre ni le panneau d\'administration ni la gestion des budgets (D1)', () => {
            expect(canAccessAdminPanel(['RESPO'])).toBe(false);
            expect(canManageExpenseBudgets(['RESPO'])).toBe(false);
            expect(isReadOnlyManager(['RESPO'])).toBe(false);
        });

        it('isPresident ne reconnaît que PRESIDENT', () => {
            expect(isPresident(['PRESIDENT'])).toBe(true);
            expect(isPresident(['SUPER_ADMIN'])).toBe(false);
            expect(isPresident(['RESPO'])).toBe(false);
            expect(isPresident(['PRESIDENT', 'INACTIF'])).toBe(false);
        });
    });

    describe('Rôle RESP_UNIFORME — responsable uniforme (uniformes uniquement)', () => {
        it('est déclaré, gérable (après RESP_VEHICULE) et libellé', () => {
            expect(ROLES.RESP_UNIFORME).toBe('RESP_UNIFORME');
            expect(MANAGEABLE_ROLES.indexOf(ROLES.RESP_UNIFORME)).toBe(MANAGEABLE_ROLES.indexOf(ROLES.RESP_VEHICULE) + 1);
            expect(rolesModule.ROLE_LABELS[ROLES.RESP_UNIFORME]).toBe('Responsable uniforme');
        });

        it('canManageUniforms : SUPER_ADMIN, ADMIN et RESP_UNIFORME, personne d\'autre', () => {
            const autorises: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.RESP_UNIFORME];
            for (const role of MANAGEABLE_ROLES) {
                expect(canManageUniforms([role]), role).toBe(autorises.includes(role));
            }
        });

        it('n\'ouvre aucun autre droit', () => {
            const r = ['RESP_UNIFORME'];
            expect(isAdminOrAbove(r)).toBe(false);
            expect(canAccessAdminPanel(r)).toBe(false);
            expect(isReadOnlyManager(r)).toBe(false);
            expect(canManageVehicles(r)).toBe(false);
            expect(canManageExpenseBudgets(r)).toBe(false);
            expect(canAssignRole(r, 'CHVL')).toBe(false);
        });

        it('est refusé une fois INACTIF (ou GUEST), même cumulé à ADMIN', () => {
            expect(canManageUniforms(['RESP_UNIFORME', 'INACTIF'])).toBe(false);
            expect(canManageUniforms(['ADMIN', 'INACTIF'])).toBe(false);
            expect(canManageUniforms(['RESP_UNIFORME', 'GUEST'])).toBe(false);
            expect(canManageUniforms([])).toBe(false);
        });
    });

    describe('Rôle RESP_VEHICULE — responsable véhicule (véhicules uniquement)', () => {
        it('est déclaré, gérable (après CADRE) et libellé', () => {
            expect(ROLES.RESP_VEHICULE).toBe('RESP_VEHICULE');
            expect(MANAGEABLE_ROLES.indexOf(ROLES.RESP_VEHICULE)).toBe(MANAGEABLE_ROLES.indexOf(ROLES.CADRE) + 1);
            expect(rolesModule.ROLE_LABELS[ROLES.RESP_VEHICULE]).toBe('Responsable véhicule');
        });

        it('canManageVehicles : SUPER_ADMIN, ADMIN et RESP_VEHICULE, personne d\'autre', () => {
            const autorises: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.RESP_VEHICULE];
            for (const role of MANAGEABLE_ROLES) {
                expect(canManageVehicles([role]), role).toBe(autorises.includes(role));
            }
        });

        it('canSuperviseVehicles : canManageVehicles + PRESIDENT, sans CADRE', () => {
            const autorises: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.RESP_VEHICULE, ROLES.PRESIDENT];
            for (const role of MANAGEABLE_ROLES) {
                expect(canSuperviseVehicles([role]), role).toBe(autorises.includes(role));
            }
        });

        it('canManageReservations : canSuperviseVehicles + CADRE', () => {
            const autorises: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.RESP_VEHICULE, ROLES.PRESIDENT, ROLES.CADRE];
            for (const role of MANAGEABLE_ROLES) {
                expect(canManageReservations([role]), role).toBe(autorises.includes(role));
            }
        });

        it('CADRE seul : ni gestion ni supervision des véhicules, mais gestion des réservations', () => {
            expect(canManageVehicles(['CADRE'])).toBe(false);
            expect(canSuperviseVehicles(['CADRE'])).toBe(false);
            expect(canManageReservations(['CADRE'])).toBe(true);
        });

        it('n\'ouvre aucun autre droit d\'administration', () => {
            const r = ['RESP_VEHICULE'];
            expect(isAdminOrAbove(r)).toBe(false);
            expect(canAccessAdminPanel(r)).toBe(false);
            expect(isReadOnlyManager(r)).toBe(false);
            expect(canManageExpenseBudgets(r)).toBe(false);
            expect(isExpenseManager(r)).toBe(false);
            expect(canAssignRole(r, 'CHVL')).toBe(false);
        });

        it('est refusé une fois INACTIF', () => {
            expect(canManageVehicles(['RESP_VEHICULE', 'INACTIF'])).toBe(false);
            expect(canSuperviseVehicles(['RESP_VEHICULE', 'INACTIF'])).toBe(false);
            expect(canManageReservations(['RESP_VEHICULE', 'INACTIF'])).toBe(false);
        });
    });

    describe('canViewStatsPage — page /stats (onglet véhicules)', () => {
        it('conserve les rôles déjà autorisés et ouvre CADRE et RESP_VEHICULE (D2)', () => {
            const autorises: string[] = [
                ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRESIDENT, ROLES.TRESORIER,
                ROLES.CHVL, ROLES.CHVPSP, ROLES.CADRE, ROLES.RESP_VEHICULE,
            ];
            for (const role of MANAGEABLE_ROLES) {
                expect(canViewStatsPage([role]), role).toBe(autorises.includes(role));
            }
        });

        it('refuse RESPO, DT et CI/RPAPS seuls', () => {
            expect(canViewStatsPage(['RESPO'])).toBe(false);
            expect(canViewStatsPage(['DT'])).toBe(false);
            expect(canViewStatsPage(['CI/RPAPS'])).toBe(false);
        });

        it('refuse un compte INACTIF, même cumulé à un rôle autorisé', () => {
            expect(canViewStatsPage(['INACTIF'])).toBe(false);
            expect(canViewStatsPage(['CADRE', 'INACTIF'])).toBe(false);
            expect(canViewStatsPage(['RESP_VEHICULE', 'INACTIF'])).toBe(false);
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

    // ── INACTIF bloque les AUTORISATIONS, pas seulement les prédicats de détection ──
    //
    // Régression fermée ici : rendre `['ADMIN','INACTIF']` stockable (resolveRoles
    // préserve) sans faire porter INACTIF par les prédicats d'autorisation laissait au
    // compte « bloqué » toute sa surface d'API — les gardes de route passent par
    // `isAdminOrAbove` / `canAccessAdminPanel` / `isSuperAdmin`, jamais par
    // `isInactive`, et le middleware ne couvre pas `/api` (src/proxy.ts:8).
    // L'interface affirmait le blocage ; le serveur ne l'appliquait pas.

    describe('dominance d\'INACTIF sur chaque prédicat d\'autorisation', () => {
        it('isSuperAdmin refuse un SUPER_ADMIN inactif', () => {
            expect(isSuperAdmin(['SUPER_ADMIN'])).toBe(true);
            expect(isSuperAdmin(['SUPER_ADMIN', 'INACTIF'])).toBe(false);
        });

        it('isAdmin refuse un ADMIN inactif', () => {
            expect(isAdmin(['ADMIN'])).toBe(true);
            expect(isAdmin(['ADMIN', 'INACTIF'])).toBe(false);
        });

        it('isAdminOrAbove refuse un ADMIN inactif (hérité par composition)', () => {
            expect(isAdminOrAbove(['ADMIN'])).toBe(true);
            expect(isAdminOrAbove(['ADMIN', 'INACTIF'])).toBe(false);
            expect(isAdminOrAbove(['SUPER_ADMIN', 'INACTIF'])).toBe(false);
        });

        it('isTresorier refuse un TRESORIER inactif', () => {
            expect(isTresorier(['TRESORIER'])).toBe(true);
            expect(isTresorier(['TRESORIER', 'INACTIF'])).toBe(false);
        });

        it('isReadOnlyManager refuse un CADRE inactif — et ne PROMEUT pas un admin bloqué', () => {
            // Piège : la clause `&& !isAdminOrAbove` s'inverse sous blocage. Sans
            // enveloppe propre, durcir isAdminOrAbove aurait promu ['ADMIN','INACTIF']
            // au rang de « lecteur », donc rouvert canAccessAdminPanel.
            expect(isReadOnlyManager(['CADRE'])).toBe(true);
            expect(isReadOnlyManager(['CADRE', 'INACTIF'])).toBe(false);
            expect(isReadOnlyManager(['ADMIN', 'INACTIF'])).toBe(false);
        });

        it('canAccessAdminPanel refuse un ADMIN, un CADRE et un PRESIDENT inactifs', () => {
            expect(canAccessAdminPanel(['ADMIN'])).toBe(true);
            expect(canAccessAdminPanel(['ADMIN', 'INACTIF'])).toBe(false);
            expect(canAccessAdminPanel(['CADRE', 'INACTIF'])).toBe(false);
            expect(canAccessAdminPanel(['PRESIDENT', 'INACTIF'])).toBe(false);
        });

        it('canManageExpenseBudgets refuse un TRESORIER et un CADRE inactifs', () => {
            expect(canManageExpenseBudgets(['TRESORIER'])).toBe(true);
            expect(canManageExpenseBudgets(['TRESORIER', 'INACTIF'])).toBe(false);
            expect(canManageExpenseBudgets(['CADRE', 'INACTIF'])).toBe(false);
        });

        it('hasDTRole refuse un DT inactif', () => {
            expect(hasDTRole(['DT'])).toBe(true);
            expect(hasDTRole(['DT', 'INACTIF'])).toBe(false);
            expect(hasDTRole(['SUPER_ADMIN', 'INACTIF'])).toBe(false);
        });

        it('isDriverRole refuse un CHVL inactif', () => {
            expect(isDriverRole(['CHVL'])).toBe(true);
            expect(isDriverRole(['CHVL', 'INACTIF'])).toBe(false);
            expect(isDriverRole(['CHVPSP', 'INACTIF'])).toBe(false);
        });

        it('canAssignRole refuse un attributeur inactif — il ne peut pas se débloquer lui-même', () => {
            expect(canAssignRole(['ADMIN'], 'CHVL')).toBe(true);
            expect(canAssignRole(['ADMIN', 'INACTIF'], 'CHVL')).toBe(false);
            expect(canAssignRole(['SUPER_ADMIN', 'INACTIF'], 'SUPER_ADMIN')).toBe(false);
        });
    });

    describe('garde structurelle — énumération des exports de src/lib/roles.ts', () => {
        // Ce test est ce qui rend la règle structurelle plutôt que confiée à la
        // vigilance : tout prédicat booléen ajouté au module sans `denyWhenInactive`
        // le fait échouer. Les seules exemptions sont les deux prédicats qui
        // DÉTECTENT l'inactivité au lieu d'autoriser — nommées ici, donc visibles.
        const DETECTEURS = new Set(['isInactive', 'isQrBlocked']);

        const predicatsAutorisation = Object.entries(rolesModule).filter(([name, valeur]) => {
            if (typeof valeur !== 'function' || DETECTEURS.has(name)) return false;
            const fn = valeur as (roles: string[]) => unknown;
            if (fn.length > 1) return false;                    // canAssignRole : testé ci-dessus
            return typeof fn(['CHVL']) === 'boolean';           // écarte resolveRoles (rend un tableau)
        }) as [string, (roles: string[]) => boolean][];

        const rolesActifs = MANAGEABLE_ROLES.filter(r => r !== ROLES.INACTIF);

        it('couvre bien tous les prédicats d\'autorisation du module', () => {
            expect(predicatsAutorisation.map(([n]) => n).sort()).toEqual([
                'canAccessAdminPanel',
                'canManageExpenseBudgets',
                'canManageReservations',
                'canManageUniforms',
                'canManageVehicles',
                'canPayExpense',
                'canSuperviseVehicles',
                'canValidateExpenseAsRespo',
                'canViewStatsPage',
                'hasDTRole',
                'isAdmin',
                'isAdminOrAbove',
                'isChvlDriver',
                'isChvpspDriver',
                'isDriverRole',
                'isExpenseManager',
                'isMissionContributor',
                'isPresident',
                'isReadOnlyManager',
                'isSuperAdmin',
                'isTresorier',
            ]);
        });

        it('aucun prédicat d\'autorisation n\'accorde quoi que ce soit à un compte INACTIF', () => {
            for (const [nom, fn] of predicatsAutorisation) {
                for (const role of rolesActifs) {
                    expect(fn([role, ROLES.INACTIF]), `${nom}(['${role}','INACTIF'])`).toBe(false);
                    expect(fn([ROLES.INACTIF, role]), `${nom}(['INACTIF','${role}'])`).toBe(false);
                }
                expect(fn([...rolesActifs, ROLES.INACTIF]), `${nom}(tous les rôles + INACTIF)`).toBe(false);
            }
        });

        it('aucun prédicat d\'autorisation n\'accorde quoi que ce soit à un compte GUEST (valeur héritée)', () => {
            for (const [nom, fn] of predicatsAutorisation) {
                for (const role of rolesActifs) {
                    expect(fn([role, 'GUEST']), `${nom}(['${role}','GUEST'])`).toBe(false);
                }
            }
        });
    });
});
