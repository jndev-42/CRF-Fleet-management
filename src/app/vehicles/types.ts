/**
 * Forme réellement renvoyée par `GET /api/vehicles` pour la liste du dashboard.
 *
 * Volontairement distinct du `Vehicle` de `@/app/vehicles/[id]/types` : la route de
 * liste ne joint que le trip **actif** projeté sur 7 champs (`api/vehicles/route.ts:79-80,136-143`)
 * et n'expose ni `desinfTracking`, ni `activeMaintenance`, ni les dates de révision.
 * Typer la liste avec le `Vehicle` complet serait un mensonge de typage : `CheckOutModal`
 * prérempli depuis un tel objet ne trouverait jamais son dernier trajet terminé.
 * Le véhicule sélectionné est donc hydraté par `GET /api/vehicles/{name}` avant d'ouvrir
 * le modal, et c'est seulement ce payload-là qui porte le type `Vehicle`.
 */
export interface DashboardVehicle {
    id: string;
    name: string;
    type: string;
    plate: string;
    status: string;
    parkingSpot: string | null;
    fuelLevel: number;
    mileage: number;
    hasDSA: boolean;
    notes: string | null;
    vin: string | null;
    fuelType: string | null;
    transmission: string | null;
    ulId?: string | null;
    ulName?: string | null;
    trips: {
        id: string;
        driverName: string;
        /** Email du conducteur principal — seul moyen, côté dashboard, de reconnaître SON trajet. */
        driverEmail: string | null;
        secondDriverName?: string | null;
        /** Email du second conducteur, `null` s'il n'y en a pas. */
        secondDriverEmail: string | null;
        missionType: string;
        checkOutAt: string;
    }[];
}
