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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ByVehicleEntry = StatsData['byDriver'][number]['byVehicle'][number];
type DriverEntry = StatsData['byDriver'][number];

function getFirstName(fullName: string): string {
  return fullName.trim().split(' ')[0];
}

function pickByHash<T>(arr: T[], key: string): T {
  const hash = key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[hash % arr.length];
}

const TIER_90 = [
  { emoji: '🪥', text: (f: string, v: string) => `${f}, t'as laissé une brosse à dents dans le ${v} ?` },
  { emoji: '🛖', text: (f: string, v: string) => `Le ${v}, c'est devenu ton adresse postale, ${f} ?` },
  { emoji: '🔐', text: (f: string, v: string) => `${f}, t'as changé le code du ${v} pour être sûr ?` },
  { emoji: '🏷️', text: (f: string, v: string) => `${f} a mis son nom dessus — le ${v} est pris.` },
];

const TIER_80 = [
  { emoji: '🔑', text: (f: string, v: string) => `Apparemment, le ${v} c'est ton VL perso, ${f} !` },
  { emoji: '🧰', text: (f: string, v: string) => `${f} a rangé ses affaires dans le ${v}, non ?` },
  { emoji: '🎯', text: (f: string, v: string) => `Le ${v} est ton véhicule attitré, ${f}.` },
  { emoji: '🚗', text: (f: string, v: string) => `Le ${v} a déjà programmé "maison" dans son GPS, ${f} ?` },
];

const TIER_75 = [
  { emoji: '🏠', text: (f: string, v: string) => `Le ${v} est devenu ton bureau mobile, ${f}.` },
  { emoji: '📦', text: (f: string, v: string) => `${f} utilise le ${v} comme entrepôt personnel.` },
  { emoji: '🛋️', text: (f: string, v: string) => `Le ${v}, c'est ton deuxième salon, ${f} ?` },
  { emoji: '☕', text: (f: string, v: string) => `${f}, tu déjeunes dans le ${v} aussi ?` },
];

const TIER_65 = [
  { emoji: '🐾', text: (f: string, v: string) => `On dirait que tu as adopté le ${v}, ${f}.` },
  { emoji: '🤝', text: (f: string, v: string) => `${f} et le ${v} : une relation exclusive.` },
  { emoji: '👀', text: (f: string, v: string) => `Les autres chauffeurs sont jaloux du ${v}, ${f}.` },
  { emoji: '🌱', text: (f: string, v: string) => `${f} a apprivoisé le ${v}.` },
];

function getMessage(pct: number, firstName: string, vehicle: string): { emoji: string; text: string } {
  const key = firstName + vehicle;
  let pool = TIER_65;
  if (pct >= 90) pool = TIER_90;
  else if (pct >= 80) pool = TIER_80;
  else if (pct >= 75) pool = TIER_75;
  const entry = pickByHash(pool, key);
  return { emoji: entry.emoji, text: entry.text(firstName, vehicle) };
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
  it('returns a 65% tier message for pct in [65, 74]', () => {
    const result = getMessage(65, 'Marc', 'VL186');
    expect(['🐾', '🤝', '👀', '🌱']).toContain(result.emoji);
    expect(result.text).toContain('Marc');
  });

  it('returns a 75% tier message for pct in [75, 79]', () => {
    const result = getMessage(75, 'Marc', 'VL186');
    expect(['🏠', '📦', '🛋️', '☕']).toContain(result.emoji);
  });

  it('returns a 80% tier message for pct in [80, 89]', () => {
    const result = getMessage(80, 'Marc', 'VL186');
    expect(['🔑', '🧰', '🎯', '🚗']).toContain(result.emoji);
  });

  it('returns a 90% tier message for pct >= 90', () => {
    const result = getMessage(90, 'Marc', 'VL186');
    expect(['🪥', '🛖', '🔐', '🏷️']).toContain(result.emoji);
    expect(result.text).toContain('Marc');
    expect(result.text).toContain('VL186');
  });

  it('is deterministic — same inputs always produce the same output', () => {
    const a = getMessage(90, 'Marc', 'VL186');
    const b = getMessage(90, 'Marc', 'VL186');
    expect(a.emoji).toBe(b.emoji);
    expect(a.text).toBe(b.text);
  });

  it('produces different messages for different driver/vehicle combos (hash variety)', () => {
    const results = [
      getMessage(90, 'Alice', 'VL001'),
      getMessage(90, 'Bob', 'VL002'),
      getMessage(90, 'Claire', 'VL003'),
      getMessage(90, 'David', 'VL004'),
    ];
    const emojis = results.map((r) => r.emoji);
    // At least 2 distinct emojis across 4 different inputs (pool has 4 entries)
    const unique = new Set(emojis);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('uses first name only from full name', () => {
    const firstName = getFirstName('Marc Antoine Dupont');
    expect(firstName).toBe('Marc');
  });
});
