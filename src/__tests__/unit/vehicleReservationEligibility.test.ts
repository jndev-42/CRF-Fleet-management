import { describe, it, expect } from 'vitest';
import {
    getReservationEligibility,
    getReservationCtaState,
    RESERVATION_CTA_MESSAGES,
    type ReservationDenialReason,
} from '@/lib/vehicleReservationEligibility';

describe('getReservationEligibility — filtre permis uniquement', () => {
    it('vue DT : refus systématique', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['ADMIN'], isDtView: true }))
            .toEqual({ canReserve: false, blockingReason: 'DT_VIEW' });
    });

    it('CHVL sur un VL : autorisé', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVL'] }))
            .toEqual({ canReserve: true, blockingReason: null });
    });

    it('CHVL sur un VPSP : refusé (VPSP_REQUIRES_CHVPSP)', () => {
        expect(getReservationEligibility({ vehicleType: 'VPSP', userRoles: ['CHVL'] }))
            .toEqual({ canReserve: false, blockingReason: 'VPSP_REQUIRES_CHVPSP' });
    });

    it('CHVPSP pur sur un VL : refusé (VL_REQUIRES_CHVL)', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVPSP'] }))
            .toEqual({ canReserve: false, blockingReason: 'VL_REQUIRES_CHVL' });
    });

    it('CHVPSP sur un VPSP : autorisé', () => {
        expect(getReservationEligibility({ vehicleType: 'VPSP 12', userRoles: ['CHVPSP'] }).canReserve).toBe(true);
    });

    it('cumul CHVL + CHVPSP : autorisé sur les deux types', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVL', 'CHVPSP'] }).canReserve).toBe(true);
        expect(getReservationEligibility({ vehicleType: 'VPSP', userRoles: ['CHVL', 'CHVPSP'] }).canReserve).toBe(true);
    });

    it('aucun rôle conducteur : refusé (ROLE_NOT_ALLOWED)', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CI/RPAPS'] }))
            .toEqual({ canReserve: false, blockingReason: 'ROLE_NOT_ALLOWED' });
    });

    it('ADMIN : bypass du permis sur tout type', () => {
        expect(getReservationEligibility({ vehicleType: 'VPSP', userRoles: ['ADMIN'] }).canReserve).toBe(true);
    });

    it('compte INACTIF : aucun droit, même avec CHVL', () => {
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVL', 'INACTIF'] }).canReserve).toBe(false);
    });

    // 🔴 Divergence VOULUE avec l'emprunt : le statut n'entre pas dans la décision.
    it('ne filtre PAS sur le statut : un véhicule IN_USE ou en maintenance reste réservable', () => {
        // La fonction n'accepte même pas de statut en entrée — la garantie est structurelle.
        expect(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVL'] }).canReserve).toBe(true);
        expect(Object.keys(getReservationEligibility({ vehicleType: 'VL', userRoles: ['CHVL'] })))
            .toEqual(['canReserve', 'blockingReason']);
    });
});

describe('getReservationCtaState', () => {
    const base = { loading: false, eligibleCount: 0, licenseBlocked: false, userRoles: ['CHVL'], denialReasons: [] as ReservationDenialReason[] };

    it('loading : état LOADING, message vide', () => {
        expect(getReservationCtaState({ ...base, loading: true }))
            .toEqual({ state: 'LOADING', reason: null, message: '' });
    });

    it('papiers bloqués pour un CHVL : LICENSE_BLOCKED, message littéral', () => {
        const res = getReservationCtaState({ ...base, licenseBlocked: true, eligibleCount: 3 });
        expect(res.state).toBe('LICENSE_BLOCKED');
        expect(res.message).toBe(
            "Vos papiers n'ont pas été validés — réservation bloquée. Présentez vos papiers à votre DLUS/DLAS.",
        );
    });

    it('papiers bloqués pour un ADMIN : pas de court-circuit, CTA nominale', () => {
        expect(getReservationCtaState({ ...base, licenseBlocked: true, eligibleCount: 2, userRoles: ['ADMIN'] }).state)
            .toBe('NOMINAL');
    });

    it('au moins un véhicule éligible : NOMINAL, message vide', () => {
        expect(getReservationCtaState({ ...base, eligibleCount: 1 }))
            .toEqual({ state: 'NOMINAL', reason: null, message: '' });
    });

    it('flotte vide : NONE_ELIGIBLE avec le message de flotte vide, jamais vide', () => {
        expect(getReservationCtaState(base))
            .toEqual({ state: 'NONE_ELIGIBLE', reason: null, message: RESERVATION_CTA_MESSAGES.EMPTY_FLEET });
    });

    it('agrégation : ROLE_NOT_ALLOWED prioritaire sur les raisons de permis', () => {
        const res = getReservationCtaState({
            ...base,
            denialReasons: ['VPSP_REQUIRES_CHVPSP', 'ROLE_NOT_ALLOWED'],
        });
        expect(res.reason).toBe('ROLE_NOT_ALLOWED');
        expect(res.message).toBe("Votre rôle ne vous permet pas de réserver de véhicule.");
    });

    it('flotte 100 % VPSP face à un CHVL : message VPSP littéral', () => {
        const res = getReservationCtaState({ ...base, denialReasons: ['VPSP_REQUIRES_CHVPSP'] });
        expect(res.message).toBe('Les seuls véhicules de votre UL sont des VPSP, réservés aux chauffeurs VPSP.');
    });

    it('flotte 100 % VL face à un CHVPSP pur : message VL littéral', () => {
        const res = getReservationCtaState({ ...base, denialReasons: ['VL_REQUIRES_CHVL'], userRoles: ['CHVPSP'] });
        expect(res.message).toBe('Les seuls véhicules de votre UL sont des véhicules légers, réservés aux chauffeurs VL.');
    });
});
