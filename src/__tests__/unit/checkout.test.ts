import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/vehicle-connection', () => ({
    isConnectedInDb: vi.fn(),
    getRenaultVehicleData: vi.fn(),
}));

vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

import { applyCheckoutCorrection, readCheckoutBaseline, sendCheckoutAlerts } from '@/lib/checkout';
import { getRenaultVehicleData, isConnectedInDb } from '@/lib/vehicle-connection';
import { sendPushNotification } from '@/lib/push';

const vehicle = { id: 'VL001', name: 'VL 186', ulId: 'ul-lyon', fuelType: 'Diesel', mileage: 12000, fuelLevel: 40, maxFuelCapacity: 50 };
const user = { id: 'usr-1', name: 'Jean Dupont', email: 'jean@croix-rouge.fr' };
const baseline = { mileage: 12000, fuel: 40 };

beforeEach(() => {
    vi.mocked(isConnectedInDb).mockReset().mockResolvedValue(false);
    vi.mocked(getRenaultVehicleData).mockReset();
    vi.mocked(sendPushNotification).mockClear();
});

describe('readCheckoutBaseline', () => {
    it('retourne les valeurs stockées pour un véhicule non connecté', async () => {
        expect(await readCheckoutBaseline(vehicle)).toEqual({ mileage: 12000, fuel: 40 });
        expect(getRenaultVehicleData).not.toHaveBeenCalled();
    });

    it('prend la télémétrie (carburant converti en %) pour un véhicule connecté', async () => {
        vi.mocked(isConnectedInDb).mockResolvedValue(true);
        vi.mocked(getRenaultVehicleData).mockResolvedValue({ totalMileage: 12500, fuelQuantity: 25, isElectric: false, batteryLevel: null } as never);
        expect(await readCheckoutBaseline(vehicle)).toEqual({ mileage: 12500, fuel: 50 });
    });

    it('prend le niveau de batterie pour un véhicule électrique', async () => {
        vi.mocked(isConnectedInDb).mockResolvedValue(true);
        vi.mocked(getRenaultVehicleData).mockResolvedValue({ totalMileage: null, fuelQuantity: null, isElectric: true, batteryLevel: 63 } as never);
        expect(await readCheckoutBaseline(vehicle)).toEqual({ mileage: 12000, fuel: 63 });
    });

    it("garde les valeurs stockées si la télémétrie échoue", async () => {
        vi.mocked(isConnectedInDb).mockResolvedValue(true);
        vi.mocked(getRenaultVehicleData).mockRejectedValue(new Error('Renault injoignable'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await readCheckoutBaseline(vehicle)).toEqual({ mileage: 12000, fuel: 40 });
        errorSpy.mockRestore();
    });
});

describe('applyCheckoutCorrection', () => {
    it('ignore les valeurs corrigées sans dataIncorrect', () => {
        expect(applyCheckoutCorrection(baseline, { correctedMileage: 1, correctedFuel: 1 })).toEqual({ ok: true, levels: baseline });
    });

    it('applique une correction partielle (carburant seul)', () => {
        expect(applyCheckoutCorrection(baseline, { dataIncorrect: true, correctedFuel: 75 })).toEqual({ ok: true, levels: { mileage: 12000, fuel: 75 } });
    });

    it('applique une hausse du kilométrage sans confirmation', () => {
        expect(applyCheckoutCorrection(baseline, { dataIncorrect: true, correctedMileage: 12100 })).toEqual({ ok: true, levels: { mileage: 12100, fuel: 40 } });
    });

    it('refuse une baisse non confirmée avec le code et le kilométrage connu', () => {
        const result = applyCheckoutCorrection(baseline, { dataIncorrect: true, correctedMileage: 1200 });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.body.code).toBe('MILEAGE_DECREASE_CONFIRM_REQUIRED');
        expect(result.body.knownMileage).toBe(12000);
        expect(result.body.error).toMatch(/1.200 km.*12.000 km/);
    });

    it('accepte une baisse confirmée', () => {
        expect(applyCheckoutCorrection(baseline, { dataIncorrect: true, correctedMileage: 1200, confirmMileageDecrease: true }))
            .toEqual({ ok: true, levels: { mileage: 1200, fuel: 40 } });
    });
});

describe('sendCheckoutAlerts', () => {
    it("n'envoie rien sans correction effective ni incident", async () => {
        await sendCheckoutAlerts({ vehicle, user, conditionOut: 'Bon état', baseline, levels: baseline });
        expect(sendPushNotification).not.toHaveBeenCalled();
    });

    it('envoie « Données incorrectes » quand une valeur change', async () => {
        await sendCheckoutAlerts({ vehicle, user, conditionOut: 'Bon état', baseline, levels: { mileage: 12500, fuel: 40 } });
        expect(sendPushNotification).toHaveBeenCalledTimes(1);
        const call = vi.mocked(sendPushNotification).mock.calls[0][0];
        expect(call.roles).toEqual(['PRESIDENT', 'RESP_VEHICULE', 'ADMIN']);
        expect(call.headings.fr).toBe('⚠️ Données incorrectes — VL 186');
        expect(call.contents.fr).toMatch(/Km : 12.000 → 12.500 km\. Carburant : 40% → 40%\./);
        expect(call).toMatchObject({ url: '/vehicles/VL%20186', ulId: 'ul-lyon', excludeUserId: 'usr-1' });
    });

    it('envoie « Incident signalé à la prise » pour un état dégradé', async () => {
        await sendCheckoutAlerts({ vehicle, user, conditionOut: 'Dégradé', baseline, levels: baseline });
        expect(sendPushNotification).toHaveBeenCalledTimes(1);
        const call = vi.mocked(sendPushNotification).mock.calls[0][0];
        expect(call.roles).toEqual(['PRESIDENT', 'RESP_VEHICULE']);
        expect(call.contents.fr).toBe('Jean Dupont a signalé un incident lors de la prise du véhicule VL 186. État: Dégradé');
    });

    it('envoie les deux alertes, et un échec de la première ne bloque pas la seconde', async () => {
        vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('push indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(sendCheckoutAlerts({ vehicle, user, conditionOut: 'Problème signalé', baseline, levels: { mileage: 12000, fuel: 10 } }))
            .resolves.toBeUndefined();
        expect(sendPushNotification).toHaveBeenCalledTimes(2);
        errorSpy.mockRestore();
    });

    it('libellé « Batterie » pour un véhicule électrique', async () => {
        await sendCheckoutAlerts({ vehicle: { ...vehicle, fuelType: 'Électrique' }, user, conditionOut: 'Bon état', baseline, levels: { mileage: 12000, fuel: 90 } });
        expect(vi.mocked(sendPushNotification).mock.calls[0][0].contents.fr).toContain('Batterie : 40% → 90%');
    });
});
