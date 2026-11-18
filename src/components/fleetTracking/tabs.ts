/**
 * Sous-onglets du suivi technique. Seul « Contacts » est livré pour l'instant ; Vue
 * d'ensemble, Tâches, Dossiers et Contrôles s'ajouteront ici (libellé compris).
 */
export const FLEET_TRACKING_TABS = ['contacts'] as const;
export type FleetTrackingTab = typeof FLEET_TRACKING_TABS[number];

export const FLEET_TRACKING_TAB_LABELS: Record<FleetTrackingTab, string> = {
    contacts: 'Contacts',
};
