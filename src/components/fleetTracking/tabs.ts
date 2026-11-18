/**
 * Sous-onglets du suivi technique (`?onglet=`). « Tâches » est l'onglet par défaut ;
 * Vue d'ensemble, Dossiers et Contrôles s'ajouteront ici (libellé compris).
 */
export const FLEET_TRACKING_TABS = ['taches', 'contacts'] as const;
export type FleetTrackingTab = typeof FLEET_TRACKING_TABS[number];

export const DEFAULT_FLEET_TRACKING_TAB: FleetTrackingTab = 'taches';

export const FLEET_TRACKING_TAB_LABELS: Record<FleetTrackingTab, string> = {
    taches: 'Tâches',
    contacts: 'Contacts',
};
