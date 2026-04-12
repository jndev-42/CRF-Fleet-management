import { Vehicle, Trip } from '@/app/vehicles/[id]/types';

const DEMO_DB_KEY = 'crf_demo_db';

const INITIAL_VEHICLES: Vehicle[] = [
    {
        id: 'demo-vpsp-1',
        name: 'VPSP - 18-01',
        type: 'VPSP (Ambulance)',
        plate: 'AA-123-BB',
        status: 'Disponible',
        parkingSpot: 'Baigneur (devant l’UL)',
        fuelLevel: 85,
        mileage: 45200,
        hasDSA: true,
        notes: 'Véhicule de démo',
        vin: null,
        fuelType: 'Diesel',
        maxFuelCapacity: 70,
        maxBatteryCapacityKwh: null,
        lastDesinfDate: '2026-03-10',
        nextDesinfMaxDate: '2026-04-21',
        firstRegistrationDate: '2020-05-15',
        revisionKmInterval: 20000,
        revisionYearInterval: 2,
        trips: []
    },
    {
        id: 'demo-vl-1',
        name: 'VL - 18-10',
        type: 'VL (Léger)',
        plate: 'CC-456-DD',
        status: 'Disponible',
        parkingSpot: 'Parking Aubervillers',
        fuelLevel: 100,
        mileage: 12500,
        hasDSA: false,
        notes: 'Véhicule de démo électrique',
        vin: null,
        fuelType: 'Électrique',
        maxFuelCapacity: null,
        maxBatteryCapacityKwh: 50,
        lastDesinfDate: null,
        nextDesinfMaxDate: null,
        firstRegistrationDate: '2023-01-20',
        revisionKmInterval: 30000,
        revisionYearInterval: 2,
        trips: []
    }
];

const INITIAL_USERS = [
    { id: 'demo-user-1', name: 'Jean Démo', email: 'jean.demo@croix-rouge.fr' },
    { id: 'demo-user-2', name: 'Marie Test', email: 'marie.test@croix-rouge.fr' }
];

interface DemoData {
    vehicles: Vehicle[];
    trips: Trip[];
    users: typeof INITIAL_USERS;
}

export class DemoDB {
    private static getData(): DemoData {
        if (typeof window === 'undefined') return { vehicles: [], trips: [], users: [] };
        const stored = localStorage.getItem(DEMO_DB_KEY);
        if (stored) return JSON.parse(stored);
        
        const initial: DemoData = {
            vehicles: INITIAL_VEHICLES,
            trips: [],
            users: INITIAL_USERS
        };
        this.saveData(initial);
        return initial;
    }

    private static saveData(data: DemoData) {
        localStorage.setItem(DEMO_DB_KEY, JSON.stringify(data));
    }

    static getVehicles() {
        const data = this.getData();
        return data.vehicles.map(v => ({
            ...v,
            trips: data.trips.filter(t => t.id === v.id)
        }));
    }

    static getVehicle(id: string) {
        const data = this.getData();
        const vehicle = data.vehicles.find(v => v.id === id);
        if (!vehicle) return null;
        return {
            ...vehicle,
            trips: data.trips.filter(t => (t as { vehicleId?: string }).vehicleId === id).sort((a,b) => new Date(b.checkOutAt).getTime() - new Date(a.checkOutAt).getTime())
        };
    }

    static getUsers() {
        return this.getData().users;
    }

    static getTrips(vehicleId?: string) {
        const data = this.getData();
        let trips = data.trips;
        if (vehicleId) {
            trips = trips.filter(t => (t as { vehicleId?: string }).vehicleId === vehicleId);
        }
        return trips.sort((a,b) => new Date(b.checkOutAt).getTime() - new Date(a.checkOutAt).getTime());
    }

    static createTrip(payload: {
        vehicleId: string;
        secondDriverId?: string;
        missionType: string;
        missionName?: string;
        parkingOut?: string;
        conditionOut: string;
        cleanlinessOut?: string;
        dsaChecked?: boolean;
        commentsOut?: string;
        driveFolderId?: string;
        dataIncorrect?: boolean;
        correctedMileage?: number;
        correctedFuel?: number;
    }) {
        const data = this.getData();
        const vehicle = data.vehicles.find(v => v.id === payload.vehicleId);
        if (!vehicle) throw new Error('Véhicule non trouvé');

        const newTrip: Trip = {
            id: 'trip-' + Date.now(),
            driverId: 'demo-user-1', // Default to current demo user
            driverName: 'Jean Démo',
            driverEmail: 'jean.demo@croix-rouge.fr',
            secondDriverId: payload.secondDriverId || null,
            secondDriverName: payload.secondDriverId ? data.users.find(u => u.id === payload.secondDriverId)?.name || null : null,
            secondDriverEmail: payload.secondDriverId ? data.users.find(u => u.id === payload.secondDriverId)?.email || null : null,
            missionType: payload.missionType,
            missionName: payload.missionName || null,
            checkOutAt: new Date().toISOString(),
            checkInAt: null,
            mileageOut: vehicle.mileage,
            mileageIn: null,
            fuelOut: vehicle.fuelLevel,
            fuelIn: null,
            parkingOut: payload.parkingOut || vehicle.parkingSpot,
            parkingIn: null,
            conditionOut: payload.conditionOut,
            conditionIn: null,
            cleanlinessOut: payload.cleanlinessOut || null,
            cleanlinessIn: null,
            dsaChecked: payload.dsaChecked || false,
            commentsOut: payload.commentsOut || null,
            commentsIn: null,
            incident: null,
            parkingPhoto: null,
            driveFolderId: payload.driveFolderId || null,
            renaultDataValidated: null,
            renaultLastCheckedAt: null,
            desinfResponsable: null,
            desinfLotNumber: null,
            desinfResponsableId: null
        };

        (newTrip as { vehicleId?: string }).vehicleId = payload.vehicleId;

        vehicle.status = 'En service';
        if (payload.dataIncorrect) {
            if (payload.correctedMileage) vehicle.mileage = payload.correctedMileage;
            if (payload.correctedFuel) vehicle.fuelLevel = payload.correctedFuel;
        }

        data.trips.push(newTrip);
        this.saveData(data);
        return newTrip;
    }

    static checkInTrip(tripId: string, payload: {
        mileageIn?: number;
        fuelIn?: number;
        parkingIn?: string;
        conditionIn?: string;
        cleanlinessIn?: string;
        incident?: string;
        commentsIn?: string;
        desinfResponsable?: string;
        desinfLotNumber?: string;
    }) {
        const data = this.getData();
        const trip = data.trips.find(t => t.id === tripId);
        if (!trip) throw new Error('Trajet non trouvé');

        const vehicle = data.vehicles.find(v => v.id === (trip as { vehicleId?: string }).vehicleId);
        if (!vehicle) throw new Error('Véhicule non trouvé');

        trip.checkInAt = new Date().toISOString();
        trip.mileageIn = payload.mileageIn || vehicle.mileage;
        trip.fuelIn = payload.fuelIn !== undefined ? payload.fuelIn : vehicle.fuelLevel;
        trip.parkingIn = payload.parkingIn || null;
        trip.conditionIn = payload.conditionIn || null;
        trip.cleanlinessIn = payload.cleanlinessIn || null;
        trip.incident = payload.incident || null;
        trip.commentsIn = payload.commentsIn || null;
        trip.desinfResponsable = payload.desinfResponsable || null;
        trip.desinfLotNumber = payload.desinfLotNumber || null;

        vehicle.status = 'Disponible';
        vehicle.mileage = trip.mileageIn;
        vehicle.fuelLevel = trip.fuelIn;
        if (trip.parkingIn) vehicle.parkingSpot = trip.parkingIn;
        if (trip.missionType === 'Désinfection' && trip.checkInAt) {
            vehicle.lastDesinfDate = trip.checkInAt.split('T')[0];
            const nextDate = new Date(trip.checkInAt);
            nextDate.setDate(nextDate.getDate() + 42);
            vehicle.nextDesinfMaxDate = nextDate.toISOString().split('T')[0];
        }

        this.saveData(data);
        return trip;
    }

    static getReservations() {
        return [];
    }
}
