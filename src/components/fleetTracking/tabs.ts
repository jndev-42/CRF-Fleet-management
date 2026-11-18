/**
 * Sous-onglets du suivi technique (`?onglet=`). « Vue d'ensemble » est l'onglet par défaut.
 */
export const FLEET_TRACKING_TABS = ['ensemble', 'taches', 'dossiers', 'controles', 'contacts'] as const;
export type FleetTrackingTab = typeof FLEET_TRACKING_TABS[number];

export const DEFAULT_FLEET_TRACKING_TAB: FleetTrackingTab = 'ensemble';

export const FLEET_TRACKING_TAB_LABELS: Record<FleetTrackingTab, string> = {
    ensemble: "Vue d'ensemble",
    taches: 'Tâches',
    dossiers: 'Dossiers',
    controles: 'Contrôles',
    contacts: 'Contacts',
};

/**
 * Filtre appliqué à l'ouverture d'un onglet (cartes de la vue d'ensemble) :
 * `filtre` (`?filtre=` : filtre des Contrôles, `echeance` pour les tâches à échéance
 * sous 30 jours, ou `pieces` pour les dossiers ayant des pièces à récupérer) et `vehicule` (`?vehicule=` : dossiers d'un véhicule).
 */
export interface FleetTabFilter {
    filter?: string | null;
    vehicle?: string | null;
}

/** Filtre « tâches à échéance sous 30 jours » (`?onglet=taches&filtre=echeance`). */
export const TASK_DUE_FILTER = 'echeance';

/** Filtre « dossiers ayant des pièces à récupérer » (`?onglet=dossiers&filtre=pieces`). */
export const DOSSIER_MISSING_FILTER = 'pieces';
