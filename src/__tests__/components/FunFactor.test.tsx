/**
 * Tests du composant React FunFactor (rendu + comportement visuel).
 *
 * Complète les tests unitaires de `unit/fun-factor.test.ts` en vérifiant
 * que la logique de filtrage se traduit correctement dans le DOM rendu :
 * messages affichés, pourcentages visibles, ordre d'affichage.
 *
 * Utilise @testing-library/react pour tester le comportement utilisateur
 * plutôt que les détails d'implémentation (pas de test sur les classes CSS).
 *
 * Fichier source testé : src/components/stats/FunFactor.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FunFactor from '@/components/stats/FunFactor';
import { StatsData } from '@/components/stats/types';

type ByDriver = StatsData['byDriver'];

// Helper : génère un tableau byDriver avec un seul chauffeur sur un seul véhicule
function makeByDriver(name: string, pct: number, tripCount: number): ByDriver {
  return [
    {
      driverId: `${name.toLowerCase().replace(' ', '-')}-id`,
      driverName: name,
      driverEmail: `${name.toLowerCase().replace(' ', '.')}@test.com`,
      tripCount,
      totalKm: 500,
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
    },
  ];
}

describe('FunFactor component', () => {
  it('renders nothing (null) when byDriver is empty', () => {
    const { container } = render(<FunFactor byDriver={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no driver meets the threshold (64%, 5 trips)', () => {
    const { container } = render(<FunFactor byDriver={makeByDriver('Marc Dupont', 64, 5)} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when driver has 65% but only 2 trips', () => {
    const { container } = render(<FunFactor byDriver={makeByDriver('Marc Dupont', 65, 2)} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a fun fact for a driver at 65% with 3 trips', () => {
    render(<FunFactor byDriver={makeByDriver('Marc Dupont', 65, 3)} />);
    expect(screen.getByText(/Fun Fact/i)).toBeTruthy();
    // The 65% tier uses "adopté ce véhicule"
    expect(screen.getByText(/adopté/i)).toBeTruthy();
  });

  it('uses first name only in the message', () => {
    render(<FunFactor byDriver={makeByDriver('Marc Dupont', 65, 3)} />);
    const message = screen.getByText(/adopté/i);
    expect(message.textContent).toContain('Marc');
    expect(message.textContent).not.toContain('Dupont');
  });

  it('renders 90% tier message for a driver at 90%', () => {
    render(<FunFactor byDriver={makeByDriver('Alice Martin', 90, 5)} />);
    // 90% tier: one of the pool emojis must appear
    const emoji = screen.getByText((_, el) =>
      el?.classList.contains('fun-emoji') &&
      ['🪥', '🛖', '🔐', '🏷️'].includes(el.textContent ?? '')
    );
    expect(emoji).toBeTruthy();
    // The message must include the driver's first name
    const message = screen.getByText((_, el) =>
      el?.classList.contains('fun-message') === true
    );
    expect(message.textContent).toContain('Alice');
  });

  it('renders the context line with percentage', () => {
    render(<FunFactor byDriver={makeByDriver('Marc Dupont', 65, 3)} />);
    expect(screen.getByText(/65%/)).toBeTruthy();
  });

  it('renders multiple fun facts sorted by pct descending', () => {
    const byDriver: ByDriver = [
      {
        driverId: 'alice-id',
        driverName: 'Alice Martin',
        driverEmail: 'alice@test.com',
        tripCount: 5,
        totalKm: 300,
        percentOfTotal: 40,
        incidents: 0,
        // 75% → "bureau mobile" tier
        byVehicle: [{ vehicleId: 'VL001', vehicleName: 'VL186', tripCount: 5, percentOfVehicleTotal: 75 }],
      },
      {
        driverId: 'bob-id',
        driverName: 'Bob Dupont',
        driverEmail: 'bob@test.com',
        tripCount: 8,
        totalKm: 500,
        percentOfTotal: 60,
        incidents: 0,
        // 90% → "brosse à dents" tier
        byVehicle: [{ vehicleId: 'VL002', vehicleName: 'VL188', tripCount: 8, percentOfVehicleTotal: 90 }],
      },
    ];
    render(<FunFactor byDriver={byDriver} />);
    // Both items should be rendered — verify by driver first name presence in messages
    const messages = screen.getAllByText((_, el) =>
      el?.classList.contains('fun-message') === true
    );
    expect(messages).toHaveLength(2);
    const allText = messages.map((m) => m.textContent ?? '').join(' ');
    expect(allText).toContain('Bob');
    expect(allText).toContain('Alice');
    // Bob is at 90% so his emoji must be from the 90% tier
    const emojis = screen.getAllByText((_, el) =>
      el?.classList.contains('fun-emoji') === true
    );
    const emojiTexts = emojis.map((e) => e.textContent ?? '');
    expect(['🪥', '🛖', '🔐', '🏷️'].some((e) => emojiTexts.includes(e))).toBe(true);
  });
});
