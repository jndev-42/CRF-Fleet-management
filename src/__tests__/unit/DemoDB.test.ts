import { describe, it, expect, beforeEach } from 'vitest';
import { DemoDB } from '@/lib/demo/DemoDB';

beforeEach(() => {
    localStorage.clear();
});

describe('DemoDB — véhicules', () => {
    it('initialise 2 véhicules de démo au premier accès', () => {
        const vehicles = DemoDB.getVehicles();
        expect(vehicles).toHaveLength(2);
    });

    it('retrouve un véhicule par id ou par nom', () => {
        const byId = DemoDB.getVehicle('VPSP - 18-01');
        expect(byId?.name).toBe('VPSP - 18-01');
        expect(DemoDB.getVehicle('inconnu')).toBeNull();
    });

    it('met à jour un véhicule (patch)', () => {
        const updated = DemoDB.updateVehicle('VPSP - 18-01', { mileage: 50000 });
        expect(updated.mileage).toBe(50000);
        expect(DemoDB.getVehicle('VPSP - 18-01')?.mileage).toBe(50000);
    });

    it('lève une erreur en mettant à jour un véhicule inconnu', () => {
        expect(() => DemoDB.updateVehicle('inconnu', { mileage: 1 })).toThrow('Véhicule non trouvé');
    });
});

describe('DemoDB — trajets', () => {
    it('crée un trajet et passe le véhicule à IN_USE', () => {
        const trip = DemoDB.createTrip({ vehicleId: 'VPSP - 18-01', missionType: 'RESEAU', conditionOut: 'BON' });
        expect(trip.mileageOut).toBe(45200);
        expect(DemoDB.getVehicle('VPSP - 18-01')?.status).toBe('IN_USE');
    });

    it('lève une erreur pour un véhicule inconnu', () => {
        expect(() => DemoDB.createTrip({ vehicleId: 'inconnu', missionType: 'RESEAU', conditionOut: 'BON' })).toThrow('Véhicule non trouvé');
    });

    it('effectue le check-in et repasse le véhicule à AVAILABLE', () => {
        const trip = DemoDB.createTrip({ vehicleId: 'VPSP - 18-01', missionType: 'RESEAU', conditionOut: 'BON' });
        const checkedIn = DemoDB.checkInTrip(trip.id, { mileageIn: 45300, fuelIn: 80 });
        expect(checkedIn.mileageIn).toBe(45300);
        expect(DemoDB.getVehicle('VPSP - 18-01')?.status).toBe('AVAILABLE');
        expect(DemoDB.getVehicle('VPSP - 18-01')?.mileage).toBe(45300);
    });

    it('lève une erreur au check-in d\'un trajet inconnu', () => {
        expect(() => DemoDB.checkInTrip('inconnu', {})).toThrow('Trajet non trouvé');
    });

    it('supprime tous les trajets d\'un véhicule', () => {
        DemoDB.createTrip({ vehicleId: 'VPSP - 18-01', missionType: 'RESEAU', conditionOut: 'BON' });
        DemoDB.deleteVehicleTrips('VPSP - 18-01');
        expect(DemoDB.getTrips('VPSP - 18-01')).toHaveLength(0);
    });
});

describe('DemoDB — missions', () => {
    it('initialise une mission de démo', () => {
        expect(DemoDB.getMissions()).toHaveLength(1);
    });

    it('crée puis supprime une mission', () => {
        const mission = DemoDB.createMission({
            vehicle_id: 'VPSP - 18-01',
            driver_id: 'demo-user-1',
            mission_type: 'DPS',
            mission_name: 'Test',
            mission_date: '2026-01-01',
            location: 'Paris',
            volunteers: 'Jean',
            pegass_ok: true,
            presence_ul: true,
            team_dynamics: 'BIEN',
            all_found_place: true,
            member_difficulties: false,
            free_comment: null,
        });
        expect(DemoDB.getMissions()).toHaveLength(2);

        DemoDB.deleteMission(mission.id);
        expect(DemoDB.getMissions()).toHaveLength(1);
    });

    it('crée une mission avec un mission_comment', () => {
        const mission = DemoDB.createMission({
            vehicle_id: 'VPSP - 18-01',
            driver_id: 'demo-user-1',
            mission_type: 'RESEAU',
            mission_name: 'Test commentaire',
            mission_date: '2026-01-02',
            location: 'Paris',
            volunteers: 'Jean',
            pegass_ok: true,
            presence_ul: null,
            team_dynamics: null,
            all_found_place: null,
            member_difficulties: null,
            free_comment: null,
            mission_comment: 'Observation utile sur la mission.',
        });
        expect(mission.mission_comment).toBe('Observation utile sur la mission.');
        expect(DemoDB.getMission(mission.id)?.mission_comment).toBe('Observation utile sur la mission.');
    });

    it('utilise null par défaut pour mission_comment quand non fourni', () => {
        const mission = DemoDB.createMission({
            vehicle_id: 'VPSP - 18-01',
            driver_id: 'demo-user-1',
            mission_type: 'RESEAU',
            mission_name: 'Test sans commentaire',
            mission_date: '2026-01-03',
            location: 'Paris',
            volunteers: 'Jean',
            pegass_ok: true,
            presence_ul: null,
            team_dynamics: null,
            all_found_place: null,
            member_difficulties: null,
            free_comment: null,
        });
        expect(mission.mission_comment).toBeNull();
    });
});

describe('DemoDB — maintenance', () => {
    it('crée et liste les enregistrements de maintenance d\'un véhicule', () => {
        DemoDB.createMaintenanceRecord({ vehicleId: 'VPSP - 18-01', date: '2026-01-01', type: 'CT', mileage: 45000 });
        const records = DemoDB.getMaintenanceRecords('VPSP - 18-01');
        expect(records).toHaveLength(1);
        expect(records[0].type).toBe('CT');
    });

    it('supprime un enregistrement de maintenance', () => {
        const record = DemoDB.createMaintenanceRecord({ vehicleId: 'VPSP - 18-01', date: '2026-01-01', type: 'CT', mileage: 45000 });
        DemoDB.deleteMaintenanceRecord(record.id);
        expect(DemoDB.getMaintenanceRecords('VPSP - 18-01')).toHaveLength(0);
    });
});

describe('DemoDB — reset', () => {
    it('réinitialise les données de démo', () => {
        DemoDB.updateVehicle('VPSP - 18-01', { mileage: 99999 });
        DemoDB.reset();
        expect(DemoDB.getVehicle('VPSP - 18-01')?.mileage).toBe(45200);
    });
});
