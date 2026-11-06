import type { VehicleDocumentMeta } from '@/lib/vehicleDocuments/types';

export interface ActiveTrip {
    id: string;
    vehicleId: string;
    driverId: string;
    secondDriverId: string | null;
    driverName: string | null;
    driverEmail: string | null;
    secondDriverName: string | null;
    secondDriverEmail: string | null;
    missionType: string;
    missionName: string | null;
    checkOutAt: string;
    mileageOut: number;
    fuelOut: number;
    conditionOut: string;
}

export interface QRVehicle {
    id: string;
    name: string;
    plate: string;
    type: string;
    status: string;
    fuelLevel: number;
    mileage: number;
    fuelType: string | null;
    hasDSA: boolean;
    desinfTracking: boolean;
    parkingSpot: string | null;
    /**
     * Statut de connexion seul — le parcours QR n'expose ni `lastError` (message Gigya
     * contenant typiquement le login), ni `brand`, ni `connectedAt`, ni `credentialId`.
     */
    connection: { status: string } | null;
    maxFuelCapacity: number | null;
    /** Documents PDF liés au véhicule (métadonnées seulement) — vide s'il n'y en a pas. */
    documents?: VehicleDocumentMeta[];
    /** Date ISO du dernier dépôt de la photo — `null` si le véhicule n'en a pas. */
    photoUpdatedAt?: string | null;
    activeTrip: ActiveTrip | null;
}

export function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
