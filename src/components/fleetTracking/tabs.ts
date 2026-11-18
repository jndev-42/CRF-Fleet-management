/**
 * Sous-onglets du suivi technique (`?onglet=`). « Tâches » est l'onglet par défaut ;
 * la Vue d'ensemble s'ajoutera ici (libellé compris).
 */
export const FLEET_TRACKING_TABS = ['taches', 'dossiers', 'controles', 'contacts'] as const;
export type FleetTrackingTab = typeof FLEET_TRACKING_TABS[number];

export const DEFAULT_FLEET_TRACKING_TAB: FleetTrackingTab = 'taches';

export const FLEET_TRACKING_TAB_LABELS: Record<FleetTrackingTab, string> = {
    taches: 'Tâches',
    dossiers: 'Dossiers',
    controles: 'Contrôles',
    contacts: 'Contacts',
};
