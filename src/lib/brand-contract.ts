/**
 * Contrat commun aux clients de marque — **types et erreurs, aucun comportement**.
 *
 * Extrait de `src/lib/renault.ts` à l'arrivée de PSA. Le laisser là aurait forcé
 * `stellantis.ts` à importer `renault.ts` pour ses seules classes d'erreur, et
 * donc à tirer Gigya et Kamereon dans un module qui ne parle ni à l'un ni à
 * l'autre. `renault.ts` ré-exporte tout ce qui suit : aucun import existant ne
 * change.
 *
 * ⚠️ Module **sans dépendance d'exécution**. Il est le plus bas de la pile des
 * marques ; y importer `@/lib/db` recréerait le cycle qu'il existe pour éviter.
 */

/**
 * Contexte de connexion d'un véhicule, porté par la donnée.
 *
 * Aucun client de marque ne lit `Vehicle`, `VehicleConnection` ni
 * `BrandCredential` : tout ce dont il a besoin arrive ici, résolu par
 * `vehicle-connection.ts`. C'est ce qui permet à ces clients de rester des
 * fonctions pures de bout en bout, testables sans base.
 */
export interface ConnectionContext {
    vehicleId: string;
    credentialId: string;
    brand: string;
    vin: string;
    login: string;
    /** Déchiffré en mémoire par `vehicle-connection.ts`, jamais journalisé. */
    password: string;
    /**
     * Capacité du réservoir, en litres.
     *
     * Présente **uniquement** parce que PSA exprime le niveau de carburant en
     * pourcentage là où l'application le manipule en litres (sept sites d'appel
     * font `fuelQuantity / maxFuelCapacity × 100`). La conversion a besoin de
     * cette valeur, et la faire remonter ici est la seule forme qui laisse
     * `stellantis.ts` ignorant du domaine : il reçoit une capacité comme il
     * reçoit un login.
     *
     * `null` pour un véhicule sans capacité renseignée — les appelants
     * retombent alors sur le défaut de 50 L déjà en vigueur.
     */
    maxFuelCapacity: number | null;
}

/**
 * Télémétrie normalisée, tous constructeurs confondus.
 *
 * Le nom porte encore « Renault » dans `renault.ts`, qui en garde un alias : la
 * forme a été définie par Kamereon et sept modules la consomment sous ce nom.
 * Le code neuf utilise `BrandVehicleData`.
 */
export interface BrandVehicleData {
    vin: string;
    totalMileage: number | null;
    /** **En litres**, jamais en pourcentage — voir `maxFuelCapacity`. */
    fuelQuantity: number | null;
    fuelAutonomy: number | null;
    batteryLevel: number | null;
    batteryAutonomy: number | null;
    chargingStatus: number | null;
    plugStatus: number | null;
    cockpitTimestamp: string | null;
    batteryTimestamp: string | null;
    isElectric: boolean;
}

/**
 * Identifiants explicitement refusés par le constructeur.
 *
 * **Seul** cas qui autorise l'appelant à basculer un credential en `ERROR`.
 * Élargir ce déclencheur ferait basculer toute la flotte en bandeau rouge au
 * premier incident réseau : le grain credential n'est sûr que parce que ce
 * déclencheur est étroit.
 */
export class BrandAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrandAuthError';
    }
}

/** Tout le reste : réseau, 5xx, configuration marque manquante. N'écrit ni ne justifie aucun statut. */
export class BrandTransientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrandTransientError';
    }
}

/**
 * Le VIN n'est pas (ou plus) rattaché au compte constructeur. Spécifique au
 * véhicule — contrairement à `BrandAuthError`, qui est une propriété du compte.
 */
export class VinNotOnAccountError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VinNotOnAccountError';
    }
}
