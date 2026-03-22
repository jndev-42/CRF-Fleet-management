export interface Trip {
    id: string;
    /** FK to User.id — the primary driver */
    driverId: string;
    /** FK to User.id — optional second driver */
    secondDriverId: string | null;
    /** Computed from JOIN User — present in API responses */
    driverName: string | null;
    driverEmail: string | null;
    /** Computed from JOIN User — present in API responses */
    secondDriverName: string | null;
    secondDriverEmail: string | null;
    missionType: string;
    missionName: string | null;
    checkOutAt: string;
    checkInAt: string | null;
    mileageOut: number;
    mileageIn: number | null;
    fuelOut: number;
    fuelIn: number | null;
    parkingOut: string | null;
    parkingIn: string | null;
    conditionOut: string;
    conditionIn: string | null;
    cleanlinessOut: string | null;
    cleanlinessIn: string | null;
    dsaChecked: boolean;
    commentsOut: string | null;
    commentsIn: string | null;
    incident: string | null;
    parkingPhoto: string | null;
    driveFolderId: string | null;
    renaultDataValidated: number | null;
    renaultLastCheckedAt: string | null;
    /** Nom du responsable de la désinfection (renseigné au check-in pour les missions Désinfection) */
    desinfResponsable: string | null;
    /** Numéro de lot du produit désinfectant (renseigné au check-in pour les missions Désinfection) */
    desinfLotNumber: string | null;
}

export interface DesinfectionRecord {
    id: string;
    checkOutAt: string;
    checkInAt: string;
    desinfResponsable: string | null;
    desinfLotNumber: string | null;
    driverName: string | null;
}

export interface Vehicle {
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
    maxFuelCapacity: number | null;
    maxBatteryCapacityKwh: number | null;
    /** Date (YYYY-MM-DD) de la dernière désinfection — uniquement pour les VPSP */
    lastDesinfDate: string | null;
    /** Date (YYYY-MM-DD) max avant la prochaine désinfection = lastDesinfDate + 42 jours */
    nextDesinfMaxDate: string | null;
    /** Date (YYYY-MM-DD) de la première immatriculation */
    firstRegistrationDate: string | null;
    /** Intervalle en km entre deux révisions */
    revisionKmInterval: number | null;
    /** Intervalle en années entre deux révisions */
    revisionYearInterval: number | null;
    trips: Trip[];
}

export interface MaintenanceRecord {
    id: string;
    vehicleId: string;
    /** Date de l'opération — format YYYY-MM-DD */
    date: string;
    type: 'CT' | 'REVISION' | 'CT_REVISION';
    mileage: number | null;
    createdAt: string;
}
