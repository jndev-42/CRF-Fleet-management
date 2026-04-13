import { Vehicle, Trip, MaintenanceRecord } from '@/app/vehicles/[id]/types';

const DEMO_DB_KEY = 'crf_demo_db';

const INITIAL_VEHICLES: Vehicle[] = [
    {
        id: 'VPSP - 18-01',
        name: 'VPSP - 18-01',
        type: 'VPSP (Ambulance)',
        plate: 'AA-123-BB',
        status: 'AVAILABLE',
        parkingSpot: 'Baigneur (devant l’UL)',
        fuelLevel: 85,
        mileage: 45200,
        hasDSA: true,
        notes: 'Véhicule de démo',
        vin: 'DEMOVIN123456789',
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
        id: 'VL - 18-10',
        name: 'VL - 18-10',
        type: 'VL (Léger)',
        plate: 'CC-456-DD',
        status: 'AVAILABLE',
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
    { id: 'demo-user-1', name: 'Jean Démo', email: 'jean.demo@croix-rouge.fr', roles: ['ADMIN', 'CHVPSP', 'RESPO', 'SECOURISTE'] },
    { id: 'demo-user-2', name: 'Marie Test', email: 'marie.test@croix-rouge.fr', roles: ['CHVL'] }
];

const INITIAL_MISSIONS: MissionDetail[] = [
    {
        id: 'mission-demo-1',
        submitted_by: 'demo-user-1',
        submitted_at: new Date().toISOString(),
        submitter_name: 'Jean Démo',
        submitter_email: 'jean.demo@croix-rouge.fr',
        mission_type: 'DPS',
        mission_name: 'Match Foot Stade de France',
        mission_date: new Date().toISOString().split('T')[0],
        location: 'Stade de France',
        volunteers: 'Jean, Marie, Pierre',
        pegass_ok: true,
        vehicle_id: 'VPSP - 18-01',
        vehicle_name: 'VPSP - 18-01',
        vehicle_type: 'VPSP (Ambulance)',
        driver_id: 'demo-user-1',
        driver_name: 'Jean Démo',
        driver_email: 'jean.demo@croix-rouge.fr',
        victim_count: 2,
        ul18_present: true,
        team_dynamics: 'BIEN',
        all_found_place: true,
        member_difficulties: false,
        free_comment: 'RAS',
        had_acr: false,
        had_hemorrhage: false,
        had_complex_care: false,
        needs_followup: false,
        drive_folder_id: null,
        signed_report_drive_id: null,
        supplies: {}
    }
];

interface MissionDetail {
    id: string;
    submitted_by: string;
    submitted_at: string;
    submitter_name: string | null;
    submitter_email: string | null;
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string;
    pegass_ok: boolean;
    vehicle_id: string | null;
    vehicle_name: string | null;
    vehicle_type: string | null;
    driver_id: string | null;
    driver_name: string | null;
    driver_email: string | null;
    victim_count: number;
    ul18_present: boolean | null;
    team_dynamics: string | null;
    all_found_place: boolean | null;
    member_difficulties: boolean | null;
    free_comment: string | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    drive_folder_id: string | null;
    signed_report_drive_id: string | null;
    supplies: Record<string, unknown[]>;
}

interface DemoData {
    vehicles: Vehicle[];
    trips: Trip[];
    users: typeof INITIAL_USERS;
    missions: MissionDetail[];
    maintenance: MaintenanceRecord[];
}

export class DemoDB {
    private static getData(): DemoData {
        if (typeof window === 'undefined') return { vehicles: [], trips: [], users: [], missions: [], maintenance: [] };
        const stored = localStorage.getItem(DEMO_DB_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            // Ensure newly added fields exist for existing demo databases
            if (!data.missions) data.missions = INITIAL_MISSIONS;
            if (!data.maintenance) data.maintenance = [];
            return data;
        }
        
        const initial: DemoData = {
            vehicles: INITIAL_VEHICLES,
            trips: [],
            users: INITIAL_USERS,
            missions: INITIAL_MISSIONS,
            maintenance: []
        };
        this.saveData(initial);
        return initial;
    }

    private static saveData(data: DemoData) {
        localStorage.setItem(DEMO_DB_KEY, JSON.stringify(data));
    }

    static reset() {
        localStorage.removeItem(DEMO_DB_KEY);
    }

    // --- VEHICLES ---

    static getVehicles() {
        const data = this.getData();
        return data.vehicles.map(v => ({
            ...v,
            trips: data.trips.filter(t => (t as unknown as { vehicleId?: string }).vehicleId === v.id)
        }));
    }

    static getVehicle(id: string) {
        const data = this.getData();
        const decodedId = decodeURIComponent(id);
        const vehicle = data.vehicles.find(v => v.id === decodedId || v.name === decodedId);
        if (!vehicle) return null;
        return {
            ...vehicle,
            trips: data.trips.filter(t => (t as unknown as { vehicleId?: string }).vehicleId === vehicle.id).sort((a,b) => new Date(b.checkOutAt).getTime() - new Date(a.checkOutAt).getTime())
        };
    }

    static updateVehicle(id: string, patch: Partial<Vehicle>) {
        const data = this.getData();
        const decodedId = decodeURIComponent(id);
        const idx = data.vehicles.findIndex(v => v.id === decodedId || v.name === decodedId);
        if (idx === -1) throw new Error('Véhicule non trouvé');
        data.vehicles[idx] = { ...data.vehicles[idx], ...patch };
        this.saveData(data);
        return data.vehicles[idx];
    }

    // --- TRIPS ---

    static getTrips(vehicleId?: string) {
        const data = this.getData();
        let trips = data.trips;
        if (vehicleId) {
            trips = trips.filter(t => (t as unknown as { vehicleId?: string }).vehicleId === vehicleId);
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
            driverId: 'demo-user-1',
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

        (newTrip as unknown as { vehicleId?: string }).vehicleId = vehicle.id;

        vehicle.status = 'IN_USE';
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

        const vehicle = data.vehicles.find(v => v.id === (trip as unknown as { vehicleId?: string }).vehicleId);
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

        vehicle.status = 'AVAILABLE';
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

    static patchTrip(tripId: string, patch: { secondDriverId?: string } & Partial<Trip>) {
        const data = this.getData();
        const idx = data.trips.findIndex(t => t.id === tripId);
        if (idx === -1) throw new Error('Trajet non trouvé');
        
        if (patch.secondDriverId) {
            const user = data.users.find(u => u.id === patch.secondDriverId);
            data.trips[idx].secondDriverId = user?.id || null;
            data.trips[idx].secondDriverName = user?.name || null;
            data.trips[idx].secondDriverEmail = user?.email || null;
        }

        data.trips[idx] = { ...data.trips[idx], ...patch };
        this.saveData(data);
        return data.trips[idx];
    }

    static deleteTrip(tripId: string) {
        const data = this.getData();
        data.trips = data.trips.filter(t => t.id !== tripId);
        this.saveData(data);
    }

    static deleteVehicleTrips(vehicleId: string) {
        const data = this.getData();
        const decodedId = decodeURIComponent(vehicleId);
        const vehicle = data.vehicles.find(v => v.id === decodedId || v.name === decodedId);
        if (!vehicle) return;
        data.trips = data.trips.filter(t => (t as unknown as { vehicleId?: string }).vehicleId !== vehicle.id);
        this.saveData(data);
    }

    // --- MISSIONS ---

    static getMissions() {
        return this.getData().missions.sort((a,b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    }

    static getMission(id: string) {
        return this.getData().missions.find(m => m.id === id) || null;
    }

    static createMission(payload: {
        vehicle_id: string | null;
        driver_id: string | null;
        mission_type: string;
        mission_name: string;
        mission_date: string;
        location: string;
        volunteers: string;
        pegass_ok: boolean;
        victim_count?: number;
        ul18_present: boolean | null;
        team_dynamics: string | null;
        all_found_place: boolean | null;
        member_difficulties: boolean | null;
        free_comment: string | null;
        had_acr?: boolean;
        had_hemorrhage?: boolean;
        had_complex_care?: boolean;
        needs_followup?: boolean;
        drive_folder_id?: string | null;
        signed_report_drive_id?: string | null;
    }) {
        const data = this.getData();
        const vehicle = data.vehicles.find(v => v.id === payload.vehicle_id);
        const driver = data.users.find(u => u.id === payload.driver_id);

        const newMission: MissionDetail = {
            id: 'mission-' + Date.now(),
            submitted_by: 'demo-user-1',
            submitted_at: new Date().toISOString(),
            submitter_name: 'Jean Démo',
            submitter_email: 'jean.demo@croix-rouge.fr',
            mission_type: payload.mission_type,
            mission_name: payload.mission_name,
            mission_date: payload.mission_date,
            location: payload.location,
            volunteers: payload.volunteers,
            pegass_ok: payload.pegass_ok,
            vehicle_id: payload.vehicle_id,
            vehicle_name: vehicle?.name || null,
            vehicle_type: vehicle?.type || null,
            driver_id: payload.driver_id,
            driver_name: driver?.name || null,
            driver_email: driver?.email || null,
            victim_count: payload.victim_count || 0,
            ul18_present: payload.ul18_present,
            team_dynamics: payload.team_dynamics,
            all_found_place: payload.all_found_place,
            member_difficulties: payload.member_difficulties,
            free_comment: payload.free_comment,
            had_acr: payload.had_acr || false,
            had_hemorrhage: payload.had_hemorrhage || false,
            had_complex_care: payload.had_complex_care || false,
            needs_followup: payload.needs_followup || false,
            drive_folder_id: payload.drive_folder_id || null,
            signed_report_drive_id: payload.signed_report_drive_id || null,
            supplies: {}
        };

        data.missions.push(newMission);
        this.saveData(data);
        return newMission;
    }

    static deleteMission(id: string) {
        const data = this.getData();
        data.missions = data.missions.filter(m => m.id !== id);
        this.saveData(data);
    }

    // --- USERS ---

    static getUsers() {
        return this.getData().users;
    }

    // --- MAINTENANCE ---

    static getMaintenanceRecords(vehicleId: string) {
        const data = this.getData();
        const decodedId = decodeURIComponent(vehicleId);
        const vehicle = data.vehicles.find(v => v.id === decodedId || v.name === decodedId);
        if (!vehicle) return [];
        return data.maintenance.filter(m => m.vehicleId === vehicle.id);
    }

    static createMaintenanceRecord(payload: {
        vehicleId: string;
        date: string;
        type: 'CT' | 'REVISION' | 'CT_REVISION';
        mileage: number | null;
    }) {
        const data = this.getData();
        const decodedId = decodeURIComponent(payload.vehicleId);
        const vehicle = data.vehicles.find(v => v.id === decodedId || v.name === decodedId);
        const newRecord: MaintenanceRecord = {
            id: 'maint-' + Date.now(),
            vehicleId: vehicle?.id || payload.vehicleId,
            date: payload.date,
            type: payload.type,
            mileage: payload.mileage,
            createdAt: new Date().toISOString()
        };
        data.maintenance.push(newRecord);
        this.saveData(data);
        return newRecord;
    }

    static deleteMaintenanceRecord(id: string) {
        const data = this.getData();
        data.maintenance = data.maintenance.filter(m => m.id !== id);
        this.saveData(data);
    }
}
