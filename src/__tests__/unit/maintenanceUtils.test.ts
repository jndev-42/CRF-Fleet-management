import { describe, it, expect } from 'vitest';
import { getNextCtDate, getNextRevision, formatDuration } from '@/lib/maintenanceUtils';
import type { MaintenanceRecord } from '@/app/vehicles/[id]/types';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeRecord(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
    return {
        id: 'rec-1',
        vehicleId: 'v-1',
        date: '2024-01-15',
        type: 'CT',
        mileage: null,
        createdAt: '2024-01-15T10:00:00.000Z',
        ...overrides,
    };
}

// ─────────────────────────────────────────────
// getNextCtDate
// ─────────────────────────────────────────────

describe('getNextCtDate', () => {
    it('VPSP without history: firstRegistrationDate + 1 year', () => {
        const vehicle = { type: 'VPSP', firstRegistrationDate: '2021-09-01' };
        const result = getNextCtDate(vehicle, []);
        expect(result).not.toBeNull();
        expect(result!.toISOString().startsWith('2022-09-01')).toBe(true);
    });

    it('VPSP with CT history: lastCT + 1 year', () => {
        const vehicle = { type: 'VPSP', firstRegistrationDate: '2021-09-01' };
        const records = [makeRecord({ date: '2025-02-20', type: 'CT' })];
        const result = getNextCtDate(vehicle, records);
        expect(result).not.toBeNull();
        expect(result!.toISOString().startsWith('2026-02-20')).toBe(true);
    });

    it('VL without history: firstRegistrationDate + 4 years', () => {
        const vehicle = { type: 'VL', firstRegistrationDate: '2018-03-20' };
        const result = getNextCtDate(vehicle, []);
        expect(result).not.toBeNull();
        expect(result!.toISOString().startsWith('2022-03-20')).toBe(true);
    });

    it('VL with CT history: lastCT + 2 years', () => {
        const vehicle = { type: 'VL', firstRegistrationDate: '2018-03-20' };
        const records = [makeRecord({ date: '2023-06-10', type: 'CT' })];
        const result = getNextCtDate(vehicle, records);
        expect(result).not.toBeNull();
        expect(result!.toISOString().startsWith('2025-06-10')).toBe(true);
    });

    it('VL with CT_REVISION history: uses CT_REVISION record', () => {
        const vehicle = { type: 'VL', firstRegistrationDate: '2018-03-20' };
        const records = [makeRecord({ date: '2023-01-01', type: 'CT_REVISION' })];
        const result = getNextCtDate(vehicle, records);
        expect(result).not.toBeNull();
        expect(result!.toISOString().startsWith('2025-01-01')).toBe(true);
    });

    it('returns null when no firstRegistrationDate and no records', () => {
        const vehicle = { type: 'VL', firstRegistrationDate: null };
        const result = getNextCtDate(vehicle, []);
        expect(result).toBeNull();
    });

    it('picks the latest CT record when multiple exist', () => {
        const vehicle = { type: 'VL', firstRegistrationDate: '2018-03-20' };
        const records = [
            makeRecord({ id: 'r1', date: '2021-06-10', type: 'CT' }),
            makeRecord({ id: 'r2', date: '2023-06-10', type: 'CT' }),
        ];
        const result = getNextCtDate(vehicle, records);
        expect(result!.toISOString().startsWith('2025-06-10')).toBe(true);
    });
});

// ─────────────────────────────────────────────
// formatDuration
// ─────────────────────────────────────────────

describe('formatDuration', () => {
    it('20 days → "20 jours"', () => {
        expect(formatDuration(20)).toBe('20 jours');
    });

    it('1 day → "1 jour"', () => {
        expect(formatDuration(1)).toBe('1 jour');
    });

    it('0 days → "0 jour"', () => {
        expect(formatDuration(0)).toBe('0 jour');
    });

    it('45 days → "1 mois"', () => {
        expect(formatDuration(45)).toBe('1 mois');
    });

    it('90 days → "3 mois"', () => {
        expect(formatDuration(90)).toBe('3 mois');
    });

    it('400 days → "1 an et 1 mois"', () => {
        expect(formatDuration(400)).toBe('1 an et 1 mois');
    });

    it('730 days → "2 ans"', () => {
        expect(formatDuration(730)).toBe('2 ans');
    });

    it('365 days → "1 an"', () => {
        expect(formatDuration(365)).toBe('1 an');
    });
});

// ─────────────────────────────────────────────
// getNextRevision
// ─────────────────────────────────────────────

describe('getNextRevision', () => {
    const baseVehicle = {
        mileage: 20000,
        firstRegistrationDate: '2020-06-15',
        revisionKmInterval: 15000,
        revisionYearInterval: 1,
    };

    it('returns null when both intervals are null', () => {
        const vehicle = { ...baseVehicle, revisionKmInterval: null, revisionYearInterval: null };
        expect(getNextRevision(vehicle, [])).toBeNull();
    });

    it('returns nextDate and remainingKm when no history — uses firstRegistrationDate', () => {
        const result = getNextRevision(baseVehicle, []);
        expect(result).not.toBeNull();
        expect(result!.nextDate).toBeInstanceOf(Date);
        // With no base mileage from record, remainingKm = full interval
        expect(result!.remainingKm).toBe(15000);
    });

    it('uses last REVISION record as baseline for date and km', () => {
        const records = [
            makeRecord({ date: '2024-01-15', type: 'REVISION', mileage: 10000 }),
        ];
        const vehicle = { ...baseVehicle, mileage: 12000 };
        const result = getNextRevision(vehicle, records);
        expect(result).not.toBeNull();
        // nextDate = 2024-01-15 + 1 year = 2025-01-15
        expect(result!.nextDate.toISOString().startsWith('2025-01-15')).toBe(true);
        // remainingKm = 15000 - (12000 - 10000) = 13000
        expect(result!.remainingKm).toBe(13000);
    });

    it('uses last CT_REVISION record as baseline', () => {
        const records = [
            makeRecord({ date: '2024-06-01', type: 'CT_REVISION', mileage: 5000 }),
        ];
        const vehicle = { ...baseVehicle, mileage: 8000 };
        const result = getNextRevision(vehicle, records);
        expect(result).not.toBeNull();
        expect(result!.nextDate.toISOString().startsWith('2025-06-01')).toBe(true);
        // remainingKm = 15000 - (8000 - 5000) = 12000
        expect(result!.remainingKm).toBe(12000);
    });

    it('returns correct values when only km interval is set', () => {
        const vehicle = { ...baseVehicle, revisionYearInterval: null, mileage: 12000 };
        const records = [makeRecord({ date: '2024-01-01', type: 'REVISION', mileage: 10000 })];
        const result = getNextRevision(vehicle, records);
        expect(result).not.toBeNull();
        // No year interval → nextDate uses firstRegistrationDate fallback? No, no year interval so nextDate falls back to today
        expect(result!.remainingKm).toBe(13000);
    });
});
