/**
 * Compteurs de flotte du tableau de bord.
 *
 * **Priorité à la maintenance.** Un véhicule peut être `IN_USE` ET porter une
 * maintenance active — c'est le cas nominal de quelqu'un parti conduire le
 * véhicule à l'atelier. Son statut projeté reste `IN_USE` (la maintenance est un
 * flag parallèle, elle n'écrase jamais l'emprunt), mais pour le compteur c'est
 * la maintenance qui compte : lire « 3 en mission » alors que l'un des trois est
 * immobilisé à l'atelier donne une image fausse de la flotte réellement mobilisable.
 *
 * Les trois catégories sont **disjointes** : chaque véhicule est compté une fois et
 * une seule, donc `available + inUse + maintenance === total`. Sans cela, cliquer un
 * compteur afficherait un nombre de cartes différent de celui annoncé.
 *
 * Le prédicat est partagé avec le filtre de la liste (`filter === 'MAINTENANCE'`) :
 * le compteur « Maintenance » et le filtre « 🔴 Maintenance » désignent par
 * construction le même ensemble de véhicules.
 */

/** Sous-ensemble structurel de `DashboardVehicle` consommé ici. */
export interface FleetStatsVehicle {
    status: string;
    hasActiveMaintenance: boolean;
}

export interface FleetStats {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
}

/**
 * `true` si le véhicule relève de la maintenance pour l'affichage — que son statut
 * le dise déjà, ou qu'il porte une maintenance active derrière un emprunt en cours.
 */
export function countsAsMaintenance(vehicle: FleetStatsVehicle): boolean {
    return vehicle.status === 'MAINTENANCE' || vehicle.hasActiveMaintenance;
}

export function computeFleetStats(vehicles: FleetStatsVehicle[]): FleetStats {
    let available = 0;
    let inUse = 0;
    let maintenance = 0;

    for (const vehicle of vehicles) {
        // La maintenance est évaluée en premier : elle l'emporte sur le statut.
        if (countsAsMaintenance(vehicle)) {
            maintenance++;
        } else if (vehicle.status === 'AVAILABLE') {
            available++;
        } else if (vehicle.status === 'IN_USE') {
            inUse++;
        }
    }

    return { total: vehicles.length, available, inUse, maintenance };
}
