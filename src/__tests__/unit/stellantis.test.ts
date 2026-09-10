/**
 * Tests unitaires — `src/lib/stellantis.ts`.
 *
 * L'essentiel porte sur `mapStatus`, qui concentre les deux conversions
 * risquées du client PSA : le carburant exprimé en pourcentage là où
 * l'application manipule des litres, et la position GPS qu'il faut **ne pas**
 * remonter. Toutes deux sont invisibles à la relecture et silencieuses en cas
 * d'erreur — une jauge fausse s'affiche sans rien signaler.
 */
import { describe, it, expect } from 'vitest';
import { mapStatus } from '@/lib/stellantis';
import type { ConnectionContext } from '@/lib/brand-contract';

const ctx = (maxFuelCapacity: number | null = 50): ConnectionContext => ({
    vehicleId: 'veh-1',
    credentialId: 'cred-1',
    brand: 'PEUGEOT',
    vin: 'VF3AB123456789012',
    login: 'compte@example.org',
    password: 'secret',
    maxFuelCapacity,
});

describe('mapStatus — carburant', () => {
    it('convertit le pourcentage PSA en litres via maxFuelCapacity', () => {
        const data = mapStatus({ energies: [{ type: 'Fuel', level: 64, autonomy: 480 }] }, ctx(60));
        // 64 % d'un réservoir de 60 L = 38,4 L. La division faite en aval
        // (`fuelQuantity / maxFuelCapacity × 100`) redonne exactement 64 %.
        expect(data.fuelQuantity).toBeCloseTo(38.4);
    });

    it('reproduit le pourcentage d’origine après la division faite en aval', () => {
        const capacity = 45;
        const data = mapStatus({ energies: [{ type: 'Fuel', level: 30 }] }, ctx(capacity));
        const affiche = Math.min(Math.round(((data.fuelQuantity ?? 0) / capacity) * 100), 100);
        expect(affiche).toBe(30);
    });

    it('ne sur-déclare jamais le carburant — régression du mapping naïf', () => {
        // Recopier `level` dans `fuelQuantity` donnait `64 / 50 = 128 %`, borné à
        // 100 : un véhicule à 64 % s'affichait plein. C'est le défaut que la
        // conversion existe pour empêcher, et il est silencieux.
        const capacity = 50;
        const data = mapStatus({ energies: [{ type: 'Fuel', level: 64 }] }, ctx(capacity));
        const affiche = Math.min(Math.round(((data.fuelQuantity ?? 0) / capacity) * 100), 100);
        expect(affiche).toBe(64);
        expect(affiche).toBeLessThan(100);
    });

    it('retombe sur 50 L quand la capacité du véhicule est inconnue', () => {
        const data = mapStatus({ energies: [{ type: 'Fuel', level: 50 }] }, ctx(null));
        expect(data.fuelQuantity).toBeCloseTo(25);
    });

    it('laisse fuelQuantity à null en l’absence d’énergie thermique', () => {
        const data = mapStatus({ energies: [{ type: 'Electric', level: 80 }] }, ctx());
        expect(data.fuelQuantity).toBeNull();
    });
});

describe('mapStatus — électrique', () => {
    it('remonte niveau, autonomie et horodatage sans conversion', () => {
        const data = mapStatus(
            {
                energies: [{ type: 'Electric', level: 64, autonomy: 292, createdAt: '2026-09-10T14:59:04Z' }],
                odometer: { mileage: 10031.4, createdAt: '2026-09-10T14:59:04Z' },
            },
            ctx()
        );
        expect(data.batteryLevel).toBe(64);
        expect(data.batteryAutonomy).toBe(292);
        expect(data.totalMileage).toBe(10031.4);
        expect(data.batteryTimestamp).toBe('2026-09-10T14:59:04Z');
        expect(data.isElectric).toBe(true);
    });

    it('traduit le booléen plugged en drapeau entier', () => {
        const branche = mapStatus(
            { energies: [{ type: 'Electric', extension: { electric: { charging: { plugged: true, status: 'InProgress' } } } }] },
            ctx()
        );
        expect(branche.plugStatus).toBe(1);
        expect(branche.chargingStatus).toBe(1);

        const debranche = mapStatus(
            { energies: [{ type: 'Electric', extension: { electric: { charging: { plugged: false, status: 'Stopped' } } } }] },
            ctx()
        );
        expect(debranche.plugStatus).toBe(0);
        expect(debranche.chargingStatus).toBe(0);
    });

    it('ne considère pas un hybride rechargeable comme électrique', () => {
        // `service.type` vaut « Electric » sur un hybride, qui a pourtant un
        // réservoir. Le classer électrique masquerait sa jauge de carburant.
        const data = mapStatus(
            {
                service: { type: 'Electric' },
                energies: [
                    { type: 'Electric', level: 40 },
                    { type: 'Fuel', level: 70 },
                ],
            },
            ctx(50)
        );
        expect(data.isElectric).toBe(false);
        expect(data.fuelQuantity).toBeCloseTo(35);
    });
});

describe('mapStatus — dégradation et vie privée', () => {
    it('renvoie des null plutôt que de lever sur une réponse vide', () => {
        const data = mapStatus({}, ctx());
        expect(data.totalMileage).toBeNull();
        expect(data.fuelQuantity).toBeNull();
        expect(data.batteryLevel).toBeNull();
        expect(data.plugStatus).toBeNull();
        expect(data.isElectric).toBe(false);
        expect(data.vin).toBe('VF3AB123456789012');
    });

    it('n’expose aucune donnée de position, même quand l’API en fournit', () => {
        // Décision explicite, pas un oubli : conserver la position des véhicules
        // d'une association revient à tracer les déplacements de bénévoles
        // identifiables. Ce test existe pour qu'un « complément » du mapping
        // casse bruyamment.
        const withPosition = {
            odometer: { mileage: 100 },
            lastPosition: { geometry: { coordinates: [2.298269, 48.937605, 37] } },
        } as Parameters<typeof mapStatus>[0];

        const data = mapStatus(withPosition, ctx());
        const serialise = JSON.stringify(data);
        expect(serialise).not.toContain('2.298269');
        expect(serialise).not.toContain('48.937605');
        expect(Object.keys(data)).not.toContain('lastPosition');
    });
});
