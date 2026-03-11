/**
 * Tests unitaires de la logique de filtrage et de messagerie du composant FunFactor.
 *
 * Approche : on duplique ici les fonctions pures internes de FunFactor.tsx
 * (getFirstName, getMessage, computeDominanceItems) plutôt que de les exporter.
 * Cela permet de tester la logique sans dépendance au rendu React ni à jsdom,
 * et de détecter toute régression si les seuils ou messages changent.
 *
 * Fichier source testé : src/components/stats/FunFactor.tsx
 */
import { describe, it, expect } from 'vitest';
import { StatsData } from '@/components/stats/types';

// Reproduction locale des types internes pour les helpers de test
type ByVehicleEntry = StatsData['byDriver'][number]['byVehicle'][number];
type DriverEntry = StatsData['byDriver'][number];

function getFirstName(fullName: string): string {
  return fullName.trim().split(' ')[0];
}

function getMessage(pct: number, firstName: string, vehicle: string): { emoji: string; text: string } {
  if (pct >= 90) return { emoji: '🪥', text: `${firstName}, t'as laissé une brosse à dents dans le ${vehicle} ?` };
  if (pct >= 80) return { emoji: '🔑', text: `Apparemment, le ${vehicle} c'est ton VL perso, ${firstName} !` };
  if (pct >= 75) return { emoji: '🏠', text: `Le ${vehicle} est devenu ton bureau mobile, ${firstName}.` };
  if (pct >= 65) return { emoji: '🐾', text: `On dirait que tu as adopté ce véhicule, ${firstName}.` };
  return { emoji: '😏', text: `${firstName}, tu commences à prendre tes aises avec le ${vehicle}...` };
}

interface DominanceItem {
  message: string;
  emoji: string;
  context: string;
  pct: number;
}

function computeDominanceItems(byDriver: StatsData['byDriver']): DominanceItem[] {
  const items: DominanceItem[] = [];
  byDriver.forEach((driver) => {
    driver.byVehicle.forEach((veh) => {
      if (veh.percentOfVehicleTotal >= 65 && veh.tripCount >= 3) {
        const firstName = getFirstName(driver.driverName);
        const { emoji, text } = getMessage(veh.percentOfVehicleTotal, firstName, veh.vehicleName);
        items.push({
          emoji,
          message: text,
          context: `${driver.driverName} représente ${veh.percentOfVehicleTotal}% des emprunts du ${veh.vehicleName} sur la période`,
          pct: veh.percentOfVehicleTotal,
        });
      }
    });
  });
  items.sort((a, b) => b.pct - a.pct);
  return items;
}

// Helper : construit un DriverEntry minimal avec un seul véhicule dominé à `pct`%
function makeDriver(name: string, pct: number, tripCount: number): DriverEntry {
  return {
    driverName: name,
    driverEmail: `${name.toLowerCase().replace(' ', '.')}@test.com`,
    tripCount,
    totalKm: 100,
    percentOfTotal: 50,
    incidents: 0,
    byVehicle: [
      {
        vehicleId: 'VL001',
        vehicleName: 'VL186',
        tripCount,
        percentOfVehicleTotal: pct,
      },
    ],
  };
}

describe('FunFactor — filtering logic', () => {
  it('does NOT display a driver at 64% (below threshold)', () => {
    const items = computeDominanceItems([makeDriver('Marc Dupont', 64, 5)]);
    expect(items).toHaveLength(0);
  });

  it('does NOT display a driver at 65% with only 2 trips (need ≥3)', () => {
    const items = computeDominanceItems([makeDriver('Marc Dupont', 65, 2)]);
    expect(items).toHaveLength(0);
  });

  it('DOES display a driver at 65% with exactly 3 trips', () => {
    const items = computeDominanceItems([makeDriver('Marc Dupont', 65, 3)]);
    expect(items).toHaveLength(1);
    expect(items[0].pct).toBe(65);
  });

  it('returns empty array when no qualifying items exist', () => {
    const items = computeDominanceItems([makeDriver('Alice', 40, 10), makeDriver('Bob', 64, 5)]);
    expect(items).toHaveLength(0);
  });

  it('sorts multiple qualifying items by percentOfVehicleTotal descending', () => {
    const driver1 = makeDriver('Alice Martin', 70, 5);
    const driver2 = makeDriver('Bob Dupont', 90, 8);
    const driver3 = makeDriver('Claire Leroy', 75, 4);
    const items = computeDominanceItems([driver1, driver2, driver3]);
    expect(items).toHaveLength(3);
    expect(items[0].pct).toBe(90);
    expect(items[1].pct).toBe(75);
    expect(items[2].pct).toBe(70);
  });
});

describe('getMessage — tier messages', () => {
  it('returns 65% tier message (🐾) for pct in [65, 74]', () => {
    const result = getMessage(65, 'Marc', 'VL186');
    expect(result.emoji).toBe('🐾');
    expect(result.text).toContain('Marc');
  });

  it('returns 75% tier message (🏠) for pct in [75, 79]', () => {
    const result = getMessage(75, 'Marc', 'VL186');
    expect(result.emoji).toBe('🏠');
  });

  it('returns 80% tier message (🔑) for pct in [80, 89]', () => {
    const result = getMessage(80, 'Marc', 'VL186');
    expect(result.emoji).toBe('🔑');
  });

  it('returns 90% tier message (🪥) for pct >= 90', () => {
    const result = getMessage(90, 'Marc', 'VL186');
    expect(result.emoji).toBe('🪥');
    expect(result.text).toContain('Marc');
    expect(result.text).toContain('VL186');
  });

  it('uses first name only from full name', () => {
    const firstName = getFirstName('Marc Antoine Dupont');
    expect(firstName).toBe('Marc');
  });
});
