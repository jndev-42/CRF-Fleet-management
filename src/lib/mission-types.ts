/**
 * Types de mission d'un emprunt de véhicule (`Trip.missionType`).
 *
 * Source unique : les formulaires de prise (fiche véhicule, QR code), la modale de
 * modification de la prise, le filtre des statistiques et la validation serveur des
 * routes de prise s'appuient tous sur cette liste. La valeur est stockée telle quelle
 * en base : ne jamais renommer une entrée (les trajets existants garderaient l'ancienne
 * valeur et sortiraient des filtres) — en ajouter une nouvelle à la place.
 */
export const MISSION_TYPES = [
    'DPS',
    'PAPS',
    'Réseaux',
    'Urgence',
    'Opération',
    'Formation',
    'Entraînement',
    'Logistique',
    'Maraude',
    'Administratif',
    'Désinfection',
    'Autre',
] as const;

export type MissionType = (typeof MISSION_TYPES)[number];

/** Type réservé aux véhicules VPSP : son retour met à jour la date de désinfection. */
export const DESINFECTION_MISSION_TYPE: MissionType = 'Désinfection';

export function isMissionType(value: unknown): value is MissionType {
    return typeof value === 'string' && (MISSION_TYPES as readonly string[]).includes(value);
}

export function isVpspVehicleType(vehicleType: string | null | undefined): boolean {
    return String(vehicleType ?? '').toUpperCase().includes('VPSP');
}

/** Types proposables pour un véhicule : « Désinfection » seulement pour un VPSP. */
export function missionTypesForVehicle(vehicleType: string | null | undefined): MissionType[] {
    const vpsp = isVpspVehicleType(vehicleType);
    return MISSION_TYPES.filter(t => t !== DESINFECTION_MISSION_TYPE || vpsp);
}

/** Libellé affiché dans une liste déroulante (la valeur stockée reste le type brut). */
export function missionTypeLabel(type: string): string {
    return type === DESINFECTION_MISSION_TYPE ? `🧴 ${type}` : type;
}
