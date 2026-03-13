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
    trips: Trip[];
}
