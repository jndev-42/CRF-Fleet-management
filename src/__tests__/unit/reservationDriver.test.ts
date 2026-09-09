import { describe, it, expect } from 'vitest';
import { UNASSIGNED_DRIVER_NAME, isUnassignedDriverName } from '@/lib/reservationDriver';

describe('UNASSIGNED_DRIVER_NAME', () => {
    it('vaut la sentinelle écrite en base par les routes de réservation', () => {
        // Valeur figée : elle est persistée dans `Reservation.userName` et comparée
        // telle quelle par les gardes serveur. La changer casserait les réservations
        // déjà en base.
        expect(UNASSIGNED_DRIVER_NAME).toBe('Chauffeur non décidé');
    });
});

describe('isUnassignedDriverName', () => {
    it('reconnaît la sentinelle exacte', () => {
        expect(isUnassignedDriverName(UNASSIGNED_DRIVER_NAME)).toBe(true);
    });

    it('rejette un nom de chauffeur réel', () => {
        expect(isUnassignedDriverName('Jean Dupont')).toBe(false);
    });

    it('est sensible à la casse et aux accents — aucune normalisation', () => {
        expect(isUnassignedDriverName('chauffeur non décidé')).toBe(false);
        expect(isUnassignedDriverName('Chauffeur non decide')).toBe(false);
    });

    it('rejette null, undefined et la chaîne vide', () => {
        expect(isUnassignedDriverName(null)).toBe(false);
        expect(isUnassignedDriverName(undefined)).toBe(false);
        expect(isUnassignedDriverName('')).toBe(false);
    });
});
