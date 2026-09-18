/**
 * Répartition des interventions d'un compte rendu de mission.
 *
 * Le total « nombre d'intervention » reste stocké dans `mission_reports.victim_count` ;
 * ce module ne décrit que les deux grilles de ventilation de ce même total :
 *   - MODE   : le type de prise en charge (soins, décharge, DAE, évac…)
 *   - NATURE : la nature clinique (petits soins, malaise, traumatisme…)
 *
 * Les deux grilles sont indépendantes et doivent chacune sommer exactement au total
 * (invariant porté par le Zod `superRefine` de `POST /api/missions` et par
 * `validateStep` dans le wizard).
 */

/** Discriminant de la table `mission_report_interventions`. */
export type InterventionBreakdown = 'MODE' | 'NATURE';

export type InterventionModeCategory =
    | 'SOINS'
    | 'DECHARGE'
    | 'DAE'
    | 'EVAC_CRF'
    | 'EVAC_AUTRES';

export type InterventionNatureCategory =
    | 'PETITS_SOINS'
    | 'MALAISE'
    | 'TRAUMATISME'
    | 'INCONSCIENCE'
    | 'ARRET_CARDIAQUE';

export type InterventionCategory = InterventionModeCategory | InterventionNatureCategory;

export const INTERVENTION_MODE_LABELS: Record<InterventionModeCategory, string> = {
    SOINS: 'Nombre de soins (sans décharge, ni évac)',
    DECHARGE: 'Nombre de décharge',
    DAE: "Nombre de mise en oeuvre DAE",
    EVAC_CRF: "Nombre d'évac CRF",
    EVAC_AUTRES: "Nombre d'évac Autres",
};

export const INTERVENTION_NATURE_LABELS: Record<InterventionNatureCategory, string> = {
    PETITS_SOINS: 'Petits soins',
    MALAISE: 'Malaise',
    TRAUMATISME: 'Traumatisme',
    INCONSCIENCE: 'Inconscience',
    ARRET_CARDIAQUE: 'Arrêt cardiaque',
};

/** Ordre de rendu de la grille « type de prise en charge ». */
export const INTERVENTION_MODE_CATEGORIES: InterventionModeCategory[] = [
    'SOINS',
    'DECHARGE',
    'DAE',
    'EVAC_CRF',
    'EVAC_AUTRES',
];

/** Ordre de rendu de la grille « nature clinique ». */
export const INTERVENTION_NATURE_CATEGORIES: InterventionNatureCategory[] = [
    'PETITS_SOINS',
    'MALAISE',
    'TRAUMATISME',
    'INCONSCIENCE',
    'ARRET_CARDIAQUE',
];

/** Libellé d'affichage d'une catégorie, quelle que soit sa grille. */
export const INTERVENTION_LABELS: Record<string, string> = {
    ...INTERVENTION_MODE_LABELS,
    ...INTERVENTION_NATURE_LABELS,
};
