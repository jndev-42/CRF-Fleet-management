/**
 * Tests unitaires — contrôles à échéance du suivi technique (`computeControls` et
 * aides pures de `src/lib/fleetTracking/controls.ts`).
 */
import { describe, it, expect } from 'vitest';
import type { MaintenanceRecord } from '@/app/vehicles/[id]/types';
import {
    addYears,
    appointmentDateError,
    appointmentSchema,
    appointmentTaskTitle,
    computeControls,
    countControls,
    dueLabel,
    matchesControlFilter,
    parisDay,
    type ControlAppointment,
    type ControlVehicle,
} from '@/lib/fleetTracking/controls';

const TODAY = '2026-11-18';

function vehicle(overrides: Partial<ControlVehicle> = {}): ControlVehicle {
    return {
        id: 'v1',
        name: '75-184',
        plate: 'AA-111-AA',
        type: 'VL',
        mileage: 50_000,
        firstRegistrationDate: null,
        revisionKmInterval: null,
        revisionYearInterval: null,
        desinfTracking: false,
        nextDesinfMaxDate: null,
        ...overrides,
    };
}

function record(overrides: Partial<MaintenanceRecord>): MaintenanceRecord {
    return { id: 'r1', vehicleId: 'v1', date: '2024-12-12', type: 'CT', mileage: null, createdAt: '', ...overrides };
}

function appointment(overrides: Partial<ControlAppointment>): ControlAppointment {
    return {
        id: 'a1', vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-11-28',
        contactId: null, contactName: null, notes: null, taskId: null, ...overrides,
    };
}

describe('computeControls — matrice', () => {
    it('CT dans 24 j sans RDV : « À dater », compté sous 30 j', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-12-12' })], [], TODAY);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ controlType: 'CT', dueDate: '2026-12-12', daysUntilDue: 24, state: 'TO_SCHEDULE', soon: true, appointment: null });
    });

    it('désinfection dépassée : « Dépassée », comptée sous 30 j', () => {
        const rows = computeControls([vehicle({ type: 'VPSP', desinfTracking: true, nextDesinfMaxDate: '2026-11-16' })], [], [], TODAY);
        const desinf = rows.find(r => r.controlType === 'DESINFECTION');
        expect(desinf).toMatchObject({ dueDate: '2026-11-16', daysUntilDue: -2, state: 'OVERDUE', soon: true });
    });

    it('RDV futur : « RDV fixé », toujours compté sous 30 j', () => {
        const rows = computeControls(
            [vehicle()], [record({ date: '2024-12-05' })],
            [appointment({ appointmentDate: '2026-11-28', contactName: 'Garage Renault Clichy' })], TODAY,
        );
        expect(rows[0]).toMatchObject({ state: 'SCHEDULED', soon: true, appointmentPast: false });
        expect(rows[0].appointment?.contactName).toBe('Garage Renault Clichy');
    });

    it('RDV le jour même : encore « RDV fixé »', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-12-05' })], [appointment({ appointmentDate: TODAY })], TODAY);
        expect(rows[0].state).toBe('SCHEDULED');
    });

    it('RDV passé : « À dater », rendez-vous conservé et marqué passé', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-12-05' })], [appointment({ appointmentDate: '2026-11-10' })], TODAY);
        expect(rows[0]).toMatchObject({ state: 'TO_SCHEDULE', appointmentPast: true });
        expect(rows[0].appointment?.appointmentDate).toBe('2026-11-10');
    });

    it('RDV passé sur une échéance dépassée : « Dépassée »', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-11-01' })], [appointment({ appointmentDate: '2026-11-10' })], TODAY);
        expect(rows[0].state).toBe('OVERDUE');
    });

    it('RDV futur sur une échéance dépassée : « RDV fixé » prime', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-11-01' })], [appointment({ appointmentDate: '2026-11-25' })], TODAY);
        expect(rows[0]).toMatchObject({ state: 'SCHEDULED', soon: true });
    });

    it('désinfection non suivie : pas de ligne désinfection', () => {
        const rows = computeControls([vehicle({ type: 'VPSP', desinfTracking: false, nextDesinfMaxDate: '2026-11-16' })], [], [], TODAY);
        expect(rows.find(r => r.controlType === 'DESINFECTION')).toBeUndefined();
    });

    it('rendez-vous d\'un autre type ou d\'un autre véhicule : ignoré', () => {
        const rows = computeControls([vehicle()], [record({ date: '2024-12-05' })], [
            appointment({ controlType: 'REVISION' }),
            appointment({ vehicleId: 'v2' }),
        ], TODAY);
        expect(rows[0].appointment).toBeNull();
    });
});

describe('computeControls — sources des échéances', () => {
    it('sans donnée suffisante : aucune ligne', () => {
        expect(computeControls([vehicle()], [], [], TODAY)).toEqual([]);
    });

    it('CT sans historique : première immatriculation + 4 ans (VL)', () => {
        const rows = computeControls([vehicle({ firstRegistrationDate: '2023-03-01' })], [], [], TODAY);
        expect(rows.find(r => r.controlType === 'CT')?.dueDate).toBe('2027-03-01');
    });

    it('révision : date et kilométrage restant si un intervalle km est configuré', () => {
        const rows = computeControls(
            [vehicle({ revisionYearInterval: 1, revisionKmInterval: 20_000, mileage: 55_000 })],
            [record({ id: 'r2', type: 'REVISION', date: '2025-12-05', mileage: 40_000 })], [], TODAY,
        );
        expect(rows.find(r => r.controlType === 'REVISION')).toMatchObject({ dueDate: '2026-12-05', remainingKm: 5_000 });
    });

    it('révision sans intervalle km : kilométrage restant inconnu', () => {
        const rows = computeControls([vehicle({ revisionYearInterval: 2 })], [record({ type: 'REVISION', date: '2025-03-14' })], [], TODAY);
        expect(rows.find(r => r.controlType === 'REVISION')).toMatchObject({ dueDate: '2027-03-14', remainingKm: null });
    });

    it('révision au seul kilométrage : pas de date calculable, pas de ligne', () => {
        const rows = computeControls([vehicle({ revisionKmInterval: 20_000, firstRegistrationDate: '2023-03-01' })], [], [], TODAY);
        expect(rows.find(r => r.controlType === 'REVISION')).toBeUndefined();
    });

    it('révision sans base de date : pas de ligne', () => {
        const rows = computeControls([vehicle({ revisionYearInterval: 1 })], [], [], TODAY);
        expect(rows.find(r => r.controlType === 'REVISION')).toBeUndefined();
    });

    it('les relevés d\'un autre véhicule ne comptent pas', () => {
        const rows = computeControls([vehicle()], [record({ vehicleId: 'v2' })], [], TODAY);
        expect(rows).toEqual([]);
    });

    it('nextDesinfMaxDate horodaté : jour Europe/Paris (pas le jour UTC)', () => {
        const rows = computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: '2026-11-30T23:30:00.000Z' })], [], [], TODAY);
        expect(rows[0]).toMatchObject({ controlType: 'DESINFECTION', dueDate: '2026-12-01' });
    });

    it('nextDesinfMaxDate au format jour : gardé tel quel', () => {
        const rows = computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: '2026-12-01' })], [], [], TODAY);
        expect(rows[0].dueDate).toBe('2026-12-01');
    });

    it('nextDesinfMaxDate illisible : pas de ligne', () => {
        expect(computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: 'bientôt' })], [], [], TODAY)).toEqual([]);
    });

    it('révision au kilométrage atteint (≤ 0 km) : « Dépassée » et sous 30 jours, même si la date est lointaine', () => {
        const v = vehicle({ revisionYearInterval: 2, revisionKmInterval: 20_000, mileage: 62_000 });
        const recs = [record({ type: 'REVISION', date: '2026-06-01', mileage: 40_000 })];
        const row = computeControls([v], recs, [], TODAY).find(r => r.controlType === 'REVISION');
        expect(row).toMatchObject({ dueDate: '2028-06-01', remainingKm: -2_000, state: 'OVERDUE', soon: true });
        const exact = computeControls([vehicle({ revisionYearInterval: 2, revisionKmInterval: 20_000, mileage: 60_000 })], recs, [], TODAY)
            .find(r => r.controlType === 'REVISION');
        expect(exact).toMatchObject({ remainingKm: 0, state: 'OVERDUE', soon: true });
    });

    it('révision au kilométrage atteint avec un RDV futur : « RDV fixé »', () => {
        const v = vehicle({ revisionYearInterval: 2, revisionKmInterval: 20_000, mileage: 62_000 });
        const recs = [record({ type: 'REVISION', date: '2026-06-01', mileage: 40_000 })];
        const row = computeControls([v], recs, [appointment({ controlType: 'REVISION', appointmentDate: '2026-11-25' })], TODAY)
            .find(r => r.controlType === 'REVISION');
        expect(row).toMatchObject({ state: 'SCHEDULED', soon: true });
    });
});

describe('computeControls — seuil et tri', () => {
    it('sous 30 jours : borne incluse (aujourd\'hui + 30 j), exclue au-delà', () => {
        const at = computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: '2026-12-18' })], [], [], TODAY);
        const after = computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: '2026-12-19' })], [], [], TODAY);
        expect(at[0].soon).toBe(true);
        expect(after[0].soon).toBe(false);
    });

    it('échéance aujourd\'hui : « À dater », pas dépassée', () => {
        const rows = computeControls([vehicle({ desinfTracking: true, nextDesinfMaxDate: TODAY })], [], [], TODAY);
        expect(rows[0]).toMatchObject({ state: 'TO_SCHEDULE', daysUntilDue: 0 });
    });

    it('tri par échéance croissante, puis véhicule, puis type', () => {
        const rows = computeControls([
            vehicle({ id: 'v1', name: '75-188', type: 'VPSP', desinfTracking: true, nextDesinfMaxDate: '2027-01-10' }),
            vehicle({ id: 'v2', name: '75-182', desinfTracking: true, nextDesinfMaxDate: '2026-11-16' }),
        ], [record({ vehicleId: 'v1', date: '2026-01-10' })], [], TODAY);
        expect(rows.map(r => `${r.vehicle.name}:${r.controlType}`)).toEqual(['75-182:DESINFECTION', '75-188:CT', '75-188:DESINFECTION']);
    });
});

describe('jour calendaire Europe/Paris', () => {
    it('23h30 UTC le 17/11 = déjà le 18/11 à Paris', () => {
        expect(parisDay(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18');
    });

    it('22h30 UTC le 18/11 en été = 19/07 à Paris (UTC+2)', () => {
        expect(parisDay(new Date('2026-07-18T22:30:00Z'))).toBe('2026-07-19');
    });

    it('bascule de jour : la même échéance devient dépassée le lendemain à Paris', () => {
        const v = [vehicle({ desinfTracking: true, nextDesinfMaxDate: '2026-11-17' })];
        expect(computeControls(v, [], [], parisDay(new Date('2026-11-17T22:59:00Z')))[0].state).toBe('TO_SCHEDULE');
        expect(computeControls(v, [], [], parisDay(new Date('2026-11-17T23:01:00Z')))[0].state).toBe('OVERDUE');
    });
});

describe('filtres et effectifs', () => {
    const rows = computeControls([
        vehicle({ id: 'v1', name: '75-182', desinfTracking: true, nextDesinfMaxDate: '2026-11-16' }),
        vehicle({ id: 'v2', name: '75-184', desinfTracking: true, nextDesinfMaxDate: '2026-12-12' }),
        vehicle({ id: 'v3', name: '75-188', desinfTracking: true, nextDesinfMaxDate: '2026-12-05' }),
        vehicle({ id: 'v4', name: '75-186', desinfTracking: true, nextDesinfMaxDate: '2027-03-14' }),
    ], [], [appointment({ vehicleId: 'v3', controlType: 'DESINFECTION' })], TODAY);

    it('countControls', () => {
        expect(countControls(rows)).toEqual({ all: 4, to_schedule: 3, soon: 3, overdue: 1, scheduled: 1 });
    });

    it('matchesControlFilter', () => {
        expect(rows.filter(r => matchesControlFilter(r, 'to_schedule')).map(r => r.vehicle.name)).toEqual(['75-182', '75-184', '75-186']);
        // Dépassée sans rendez-vous : à dater ET dépassée.
        expect(rows.filter(r => matchesControlFilter(r, 'overdue')).map(r => r.vehicle.name)).toEqual(['75-182']);
        expect(rows.filter(r => matchesControlFilter(r, 'scheduled')).map(r => r.vehicle.name)).toEqual(['75-188']);
    });
});

describe('aides', () => {
    it('dueLabel', () => {
        expect(dueLabel({ dueDate: '2026-12-12', daysUntilDue: 24 })).toBe('12/12/2026 · dans 24 j');
        expect(dueLabel({ dueDate: '2026-11-16', daysUntilDue: -2 })).toBe('16/11/2026 · dépassée de 2 j');
        expect(dueLabel({ dueDate: TODAY, daysUntilDue: 0 })).toBe("18/11/2026 · aujourd'hui");
    });

    it('addYears et appointmentDateError (aujourd\'hui → + 5 ans)', () => {
        expect(addYears('2026-11-18', 5)).toBe('2031-11-18');
        expect(addYears('2028-02-29', 1)).toBe('2029-03-01');
        expect(appointmentDateError(TODAY, TODAY)).toBeNull();
        expect(appointmentDateError('2031-11-18', TODAY)).toBeNull();
        expect(appointmentDateError('2026-11-17', TODAY)).toMatch(/passée/);
        expect(appointmentDateError('2031-11-19', TODAY)).toMatch(/5 ans/);
    });

    it('appointmentTaskTitle', () => {
        expect(appointmentTaskTitle('CT', '75-184')).toBe('Rendez-vous contrôle technique — 75-184');
    });

    it('appointmentSchema : valeurs par défaut et refus', () => {
        expect(appointmentSchema.parse({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-11-28', contactId: '' }))
            .toEqual({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-11-28', contactId: null, notes: null, createTask: false });
        expect(appointmentSchema.safeParse({ vehicleId: 'v1', controlType: 'VIDANGE', appointmentDate: '2026-11-28' }).success).toBe(false);
        expect(appointmentSchema.safeParse({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '28/11/2026' }).success).toBe(false);
        expect(appointmentSchema.safeParse({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-02-30' }).success).toBe(false);
        expect(appointmentSchema.safeParse({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-11-28', notes: 'x'.repeat(501) }).success).toBe(false);
        expect(appointmentSchema.safeParse({ vehicleId: 'v1', controlType: 'CT', appointmentDate: '2026-11-28', ulId: 'x' }).success).toBe(false);
    });
});
