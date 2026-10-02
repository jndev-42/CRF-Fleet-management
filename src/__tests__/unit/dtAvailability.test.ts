/**
 * Règle de disponibilité de la Vue DT.
 *
 * Fichier testé : src/lib/dtAvailability.ts
 */
import { describe, it, expect } from 'vitest';
import {
    computeVehicleAvailability,
    parseDtWindow,
    normalizeVehicleType,
    compareVehicleTypes,
    type DtReservation,
    type DtMaintenance,
} from '@/lib/dtAvailability';

const NOW = new Date('2026-10-07T10:00:00.000Z');
const SAT_START = new Date('2026-10-10T06:00:00.000Z');
const SAT_END = new Date('2026-10-10T18:00:00.000Z');

function resa(overrides: Partial<DtReservation> = {}): DtReservation {
    return {
        id: 'r-1',
        startTime: '2026-10-10T07:00:00.000Z',
        endTime: '2026-10-10T12:00:00.000Z',
        userName: 'Alice Martin',
        status: 'PENDING',
        reason: 'DPS semi-marathon',
        ...overrides,
    };
}

function compute(opts: {
    reservations?: DtReservation[];
    maintenances?: DtMaintenance[];
    openTrip?: { checkOutAt: string } | null;
    windowStart?: Date;
    windowEnd?: Date;
    now?: Date;
}) {
    return computeVehicleAvailability({
        reservations: opts.reservations ?? [],
        maintenances: opts.maintenances ?? [],
        openTrip: opts.openTrip ?? null,
        windowStart: opts.windowStart ?? SAT_START,
        windowEnd: opts.windowEnd ?? SAT_END,
        now: opts.now ?? NOW,
    });
}

describe('computeVehicleAvailability', () => {
    it('Maintenant, sans bloqueur → AVAILABLE', () => {
        const res = compute({ windowStart: NOW, windowEnd: NOW });
        expect(res).toEqual({ status: 'AVAILABLE', missionSince: null, reservations: [] });
    });

    it('Maintenant, réservation en cours → RESERVED', () => {
        const r = resa({ startTime: '2026-10-07T09:00:00.000Z', endTime: '2026-10-07T11:00:00.000Z', status: 'VALIDATED' });
        const res = compute({ reservations: [r], windowStart: NOW, windowEnd: NOW });
        expect(res.status).toBe('RESERVED');
        expect(res.reservations).toEqual([r]);
    });

    it('Maintenant, trajet ouvert → IN_USE avec missionSince', () => {
        const res = compute({ openTrip: { checkOutAt: '2026-10-06T18:40:00.000Z' }, windowStart: NOW, windowEnd: NOW });
        expect(res.status).toBe('IN_USE');
        expect(res.missionSince).toBe('2026-10-06T18:40:00.000Z');
    });

    it('Période future, réservation PENDING chevauchante → RESERVED avec réservant, statut et motif', () => {
        const res = compute({ reservations: [resa()] });
        expect(res.status).toBe('RESERVED');
        expect(res.reservations[0]).toMatchObject({ userName: 'Alice Martin', status: 'PENDING', reason: 'DPS semi-marathon' });
    });

    it('ignore les réservations hors fenêtre et les autres statuts', () => {
        const res = compute({
            reservations: [
                resa({ id: 'r-avant', startTime: '2026-10-09T07:00:00.000Z', endTime: '2026-10-09T12:00:00.000Z' }),
                resa({ id: 'r-refusee', status: 'REJECTED' as DtReservation['status'] }),
            ],
        });
        expect(res.status).toBe('AVAILABLE');
        expect(res.reservations).toEqual([]);
    });

    it('trie les réservations par début', () => {
        const late = resa({ id: 'r-late', startTime: '2026-10-10T14:00:00.000Z', endTime: '2026-10-10T16:00:00.000Z' });
        const early = resa({ id: 'r-early' });
        expect(compute({ reservations: [late, early] }).reservations.map((r) => r.id)).toEqual(['r-early', 'r-late']);
    });

    it('Trajet ouvert, période entièrement future → POTENTIAL avec missionSince', () => {
        const res = compute({ openTrip: { checkOutAt: '2026-10-06T18:40:00.000Z' } });
        expect(res.status).toBe('POTENTIAL');
        expect(res.missionSince).toBe('2026-10-06T18:40:00.000Z');
    });

    it('Période entamée (fenêtre tronquée à maintenant), trajet ouvert → IN_USE', () => {
        const res = compute({ openTrip: { checkOutAt: '2026-10-07T08:00:00.000Z' }, windowStart: NOW, windowEnd: SAT_END });
        expect(res.status).toBe('IN_USE');
    });

    it('Maintenance + réservation → MAINTENANCE (priorité)', () => {
        const res = compute({
            reservations: [resa()],
            maintenances: [{ startDate: '2026-10-10T10:00:00.000Z', endDate: '2026-10-10T11:00:00.000Z' }],
            openTrip: { checkOutAt: '2026-10-06T18:40:00.000Z' },
        });
        expect(res.status).toBe('MAINTENANCE');
        expect(res.reservations).toHaveLength(1);
    });

    it('Trajet ouvert sur fenêtre incluant maintenant l’emporte sur une réservation', () => {
        const r = resa({ startTime: '2026-10-07T09:00:00.000Z', endTime: '2026-10-07T11:00:00.000Z' });
        const res = compute({ reservations: [r], openTrip: { checkOutAt: '2026-10-07T08:00:00.000Z' }, windowStart: NOW, windowEnd: NOW });
        expect(res.status).toBe('IN_USE');
    });

    it('Réservation l’emporte sur POTENTIAL', () => {
        const res = compute({ reservations: [resa()], openTrip: { checkOutAt: '2026-10-06T18:40:00.000Z' } });
        expect(res.status).toBe('RESERVED');
        expect(res.missionSince).toBe('2026-10-06T18:40:00.000Z');
    });

    describe('maintenances', () => {
        it('date seule = journée entière', () => {
            const res = compute({ maintenances: [{ startDate: '2026-10-10', endDate: '2026-10-10' }] });
            expect(res.status).toBe('MAINTENANCE');
        });

        it('date seule de fin : couvre jusqu’à la fin de la journée', () => {
            const res = compute({
                maintenances: [{ startDate: '2026-10-09', endDate: '2026-10-09' }],
                windowStart: new Date('2026-10-09T23:00:00.000Z'),
                windowEnd: new Date('2026-10-10T01:00:00.000Z'),
            });
            expect(res.status).toBe('MAINTENANCE');
        });

        it('date seule terminée la veille → pas de maintenance', () => {
            const res = compute({ maintenances: [{ startDate: '2026-10-08', endDate: '2026-10-09' }] });
            expect(res.status).toBe('AVAILABLE');
        });

        it('sans fin (endDate NULL) → bloque indéfiniment', () => {
            const res = compute({ maintenances: [{ startDate: '2026-09-28', endDate: null }] });
            expect(res.status).toBe('MAINTENANCE');
        });

        it('chevauchement partiel suffit', () => {
            const res = compute({ maintenances: [{ startDate: '2026-10-10T17:00:00.000Z', endDate: '2026-10-11T08:00:00.000Z' }] });
            expect(res.status).toBe('MAINTENANCE');
        });

        it('mode Maintenant : maintenance qui commence demain → AVAILABLE', () => {
            const res = compute({ maintenances: [{ startDate: '2026-10-08', endDate: null }], windowStart: NOW, windowEnd: NOW });
            expect(res.status).toBe('AVAILABLE');
        });
    });

    describe('bornes exactes', () => {
        it('fin de réservation = début de fenêtre → pas de chevauchement', () => {
            const r = resa({ startTime: '2026-10-10T02:00:00.000Z', endTime: SAT_START.toISOString() });
            expect(compute({ reservations: [r] }).status).toBe('AVAILABLE');
        });

        it('début de réservation = fin de fenêtre → pas de chevauchement', () => {
            const r = resa({ startTime: SAT_END.toISOString(), endTime: '2026-10-10T20:00:00.000Z' });
            expect(compute({ reservations: [r] }).status).toBe('AVAILABLE');
        });

        it('mode Maintenant : réservation qui finit maintenant → libre, qui commence maintenant → réservé', () => {
            const ending = resa({ startTime: '2026-10-07T08:00:00.000Z', endTime: NOW.toISOString() });
            const starting = resa({ startTime: NOW.toISOString(), endTime: '2026-10-07T12:00:00.000Z' });
            expect(compute({ reservations: [ending], windowStart: NOW, windowEnd: NOW }).status).toBe('AVAILABLE');
            expect(compute({ reservations: [starting], windowStart: NOW, windowEnd: NOW }).status).toBe('RESERVED');
        });
    });
});

describe('parseDtWindow', () => {
    it('sans from/to → mode Maintenant', () => {
        const res = parseDtWindow(null, null, NOW);
        expect(res).toEqual({ ok: true, window: { start: NOW, end: NOW, isNow: true, truncated: false } });
    });

    it('période future valide', () => {
        const res = parseDtWindow(SAT_START.toISOString(), SAT_END.toISOString(), NOW);
        expect(res).toEqual({ ok: true, window: { start: SAT_START, end: SAT_END, isNow: false, truncated: false } });
    });

    it('accepte un décalage horaire explicite', () => {
        const res = parseDtWindow('2026-10-10T08:00:00+02:00', '2026-10-10T20:00:00+02:00', NOW);
        expect(res.ok && res.window.start.toISOString()).toBe('2026-10-10T06:00:00.000Z');
    });

    it('période entamée → début tronqué à maintenant', () => {
        const res = parseDtWindow('2026-10-07T08:00:00.000Z', '2026-10-07T20:00:00.000Z', NOW);
        expect(res).toEqual({
            ok: true,
            window: { start: NOW, end: new Date('2026-10-07T20:00:00.000Z'), isNow: false, truncated: true },
        });
    });

    it.each([
        ['from seul', SAT_START.toISOString(), null, 'MISSING'],
        ['to seul', null, SAT_END.toISOString(), 'MISSING'],
        ['date non ISO', '10/10/2026', SAT_END.toISOString(), 'INVALID'],
        ['date sans heure', '2026-10-10', '2026-10-11', 'INVALID'],
        ['to = from', SAT_START.toISOString(), SAT_START.toISOString(), 'ORDER'],
        ['to < from', SAT_END.toISOString(), SAT_START.toISOString(), 'ORDER'],
        ['to = maintenant', '2026-10-07T08:00:00.000Z', NOW.toISOString(), 'PAST'],
        ['to passé', '2026-10-01T08:00:00.000Z', '2026-10-01T20:00:00.000Z', 'PAST'],
        ['plus de 31 jours', '2026-10-08T00:00:00.000Z', '2026-11-08T00:00:01.000Z', 'TOO_LONG'],
    ])('%s → refus', (_label, from, to, code) => {
        const res = parseDtWindow(from, to, NOW);
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe(code);
            expect(res.error).toMatch(/[a-zé]/i);
        }
    });

    it('période entamée : la durée est mesurée de maintenant à la fin', () => {
        // 46 jours demandés, mais 28 jours seulement de maintenant à la fin.
        const res = parseDtWindow('2026-09-20T00:00:00.000Z', '2026-11-05T00:00:00.000Z', NOW);
        expect(res).toEqual({
            ok: true,
            window: { start: NOW, end: new Date('2026-11-05T00:00:00.000Z'), isNow: false, truncated: true },
        });
        // Plus de 31 jours de maintenant à la fin : refusé.
        const tooLong = parseDtWindow('2026-09-20T00:00:00.000Z', '2026-11-07T10:00:01.000Z', NOW);
        expect(!tooLong.ok && tooLong.code).toBe('TOO_LONG');
    });

    it('31 jours pile → accepté', () => {
        const res = parseDtWindow('2026-10-08T00:00:00.000Z', '2026-11-08T00:00:00.000Z', NOW);
        expect(res.ok).toBe(true);
    });

    it('messages en français', () => {
        const order = parseDtWindow(SAT_END.toISOString(), SAT_START.toISOString(), NOW);
        expect(!order.ok && order.error).toBe('La fin doit être après le début.');
        const long = parseDtWindow('2026-10-08T00:00:00.000Z', '2026-12-08T00:00:00.000Z', NOW);
        expect(!long.ok && long.error).toBe('Période limitée à 31 jours.');
    });
});

describe('normalizeVehicleType', () => {
    it.each([
        ['VPSP', 'VPSP'],
        [' vpsp ', 'VPSP'],
        ['vl', 'VL'],
        ['utilitaire', 'Utilitaire'],
        ['MOTO', 'Moto'],
        ['minibus', 'MINIBUS'],
        ['Mini   bus', 'MINI BUS'],
        ['', 'Sans type'],
        ['   ', 'Sans type'],
        [null, 'Sans type'],
    ])('%j → %s', (input, expected) => {
        expect(normalizeVehicleType(input)).toBe(expected);
    });
});

describe('compareVehicleTypes', () => {
    it('types connus, puis autres par ordre alphabétique, puis Sans type', () => {
        const sorted = ['Sans type', 'QUAD', 'Moto', 'VL', 'BATEAU', 'Utilitaire', 'VPSP'].sort(compareVehicleTypes);
        expect(sorted).toEqual(['VPSP', 'VL', 'Utilitaire', 'Moto', 'BATEAU', 'QUAD', 'Sans type']);
    });
});
