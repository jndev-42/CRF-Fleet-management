/**
 * Tests du découpage par jour des événements du calendrier véhicules (issue #141).
 *
 * Fichier testé : src/lib/calendarDaySpan.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDaySpanLabel, overlapsDay } from '@/lib/calendarDaySpan';

// Les heures attendues sont lues en heure locale : on fixe le fuseau de l'appli, ce qui
// rend aussi significatif le test du passage à l'heure d'hiver (25/10/2026).
let previousTz: string | undefined;
beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
});
afterAll(() => {
  process.env.TZ = previousTz;
});

/** Date locale (mois 1-indexé pour la lisibilité). */
function at(day: number, hour = 0, minute = 0, month = 10): Date {
  return new Date(2026, month - 1, day, hour, minute);
}

function dayBounds(day: number, month = 10): [Date, Date] {
  const start = new Date(2026, month - 1, day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(2026, month - 1, day);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

describe('getDaySpanLabel', () => {
  it('affiche l’heure de début seule pour un événement sur un seul jour', () => {
    expect(getDaySpanLabel(at(30, 7), at(30, 18), at(30))).toBe('07:00');
  });

  it('cas de l’issue #141 : 30 à 07:00 → 31 à 07:00', () => {
    expect(getDaySpanLabel(at(30, 7), at(31, 7), at(30))).toBe('07:00 →');
    expect(getDaySpanLabel(at(30, 7), at(31, 7), at(31))).toBe('→ 07:00');
  });

  it('affiche l’heure de fin le dernier jour d’un emprunt', () => {
    expect(getDaySpanLabel(at(30, 18), at(31, 9, 30), at(31))).toBe('→ 09:30');
  });

  it('affiche « Journée » sur un jour intermédiaire', () => {
    expect(getDaySpanLabel(at(29, 7), at(31, 7), at(30))).toBe('Journée');
  });

  it('reste juste le jour du passage à l’heure d’hiver (25/10/2026)', () => {
    expect(getDaySpanLabel(at(24, 22), at(26, 7), at(25))).toBe('Journée');
    expect(getDaySpanLabel(at(25, 1, 30), at(26, 7), at(25))).toBe('01:30 →');
    expect(getDaySpanLabel(at(24, 22), at(25, 23, 30), at(25))).toBe('→ 23:30');
  });

  it('ne dépend pas de l’heure de la date du jour passée', () => {
    expect(getDaySpanLabel(at(30, 7), at(31, 7), at(31, 23, 59))).toBe('→ 07:00');
  });
});

describe('overlapsDay', () => {
  it('inclut chaque jour couvert par l’événement', () => {
    expect(overlapsDay(at(30, 7), at(31, 7), ...dayBounds(30))).toBe(true);
    expect(overlapsDay(at(30, 7), at(31, 7), ...dayBounds(31))).toBe(true);
  });

  it('exclut les jours hors de l’événement', () => {
    expect(overlapsDay(at(30, 7), at(31, 7), ...dayBounds(29))).toBe(false);
    expect(overlapsDay(at(30, 7), at(31, 7), ...dayBounds(1, 11))).toBe(false);
  });

  it('exclut le jour qui commence pile à l’heure de fin (00:00)', () => {
    expect(overlapsDay(at(30, 7), at(31, 0), ...dayBounds(30))).toBe(true);
    expect(overlapsDay(at(30, 7), at(31, 0), ...dayBounds(31))).toBe(false);
  });

  it('garde visible un événement de durée nulle à 00:00', () => {
    expect(overlapsDay(at(31, 0), at(31, 0), ...dayBounds(31))).toBe(true);
    expect(overlapsDay(at(31, 0), at(31, 0), ...dayBounds(30))).toBe(false);
  });
});
