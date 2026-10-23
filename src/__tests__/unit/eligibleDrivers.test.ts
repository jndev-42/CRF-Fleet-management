import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));

import { driverRoleForVehicleType } from '@/lib/eligibleDrivers';

describe('driverRoleForVehicleType', () => {
    it('exige CHVPSP pour un VPSP, quelle que soit la casse', () => {
        expect(driverRoleForVehicleType('VPSP')).toBe('CHVPSP');
        expect(driverRoleForVehicleType('vpsp 2')).toBe('CHVPSP');
    });

    it('exige CHVL pour tout autre type, y compris absent', () => {
        expect(driverRoleForVehicleType('VL')).toBe('CHVL');
        expect(driverRoleForVehicleType(null)).toBe('CHVL');
        expect(driverRoleForVehicleType(undefined)).toBe('CHVL');
    });
});
