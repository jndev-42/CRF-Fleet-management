export interface Trip {
    id: string;
    driverName: string;
    driverEmail: string | null;
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
    dsaUsed: boolean | null;
    commentsOut: string | null;
    commentsIn: string | null;
    secondDriverName: string | null;
    secondDriverEmail: string | null;
    windowsClosed: boolean | null;
    vehicleInspected: boolean | null;
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
    trips: Trip[];
}
