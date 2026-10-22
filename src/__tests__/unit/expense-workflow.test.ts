import { describe, it, expect } from 'vitest';
import {
    workflowVersionOf, validationStage, canSignStage, signsBothSteps, canViewExpense, activeUlId,
} from '@/lib/expenses/workflow';

describe('workflowVersionOf', () => {
    it('ne reconnaît le nouveau circuit que pour la valeur 2', () => {
        expect(workflowVersionOf(2)).toBe(2);
        expect(workflowVersionOf('2')).toBe(2);
        expect(workflowVersionOf(1)).toBe(1);
        // Colonne absente ou nulle : note antérieure, ancien circuit.
        expect(workflowVersionOf(null)).toBe(1);
        expect(workflowVersionOf(undefined)).toBe(1);
    });
});

describe('validationStage', () => {
    it('note v1 soumise : validation unique par le président', () => {
        expect(validationStage('soumis', 1)).toBe('legacy');
        expect(validationStage('soumis', null)).toBe('legacy');
    });

    it('note v2 : étape RESPO puis étape président', () => {
        expect(validationStage('soumis', 2)).toBe('respo');
        expect(validationStage('valide_respo', 2)).toBe('president');
    });

    it('aucune étape pour les autres statuts', () => {
        for (const status of ['brouillon', 'en_attente_paiement', 'traité', 'refusé']) {
            expect(validationStage(status, 2)).toBeNull();
            expect(validationStage(status, 1)).toBeNull();
        }
        // `valide_respo` n'existe pas dans l'ancien circuit.
        expect(validationStage('valide_respo', 1)).toBeNull();
    });
});

describe('canSignStage', () => {
    it('étape RESPO : RESPO, président, super admin', () => {
        expect(canSignStage(['RESPO'], 'respo')).toBe(true);
        expect(canSignStage(['PRESIDENT'], 'respo')).toBe(true);
        expect(canSignStage(['SUPER_ADMIN'], 'respo')).toBe(true);
        expect(canSignStage(['TRESORIER'], 'respo')).toBe(false);
        expect(canSignStage(['CADRE'], 'respo')).toBe(false);
    });

    it('étape président et circuit v1 : jamais le RESPO', () => {
        for (const stage of ['president', 'legacy'] as const) {
            expect(canSignStage(['RESPO'], stage)).toBe(false);
            expect(canSignStage(['PRESIDENT'], stage)).toBe(true);
            expect(canSignStage(['SUPER_ADMIN'], stage)).toBe(true);
        }
    });

    it('refuse un compte inactif', () => {
        expect(canSignStage(['RESPO', 'INACTIF'], 'respo')).toBe(false);
        expect(canSignStage(['PRESIDENT', 'INACTIF'], 'president')).toBe(false);
    });
});

describe('signsBothSteps', () => {
    it('vrai pour le président ou le super admin à l\'étape RESPO seulement', () => {
        expect(signsBothSteps(['PRESIDENT'], 'respo')).toBe(true);
        expect(signsBothSteps(['SUPER_ADMIN'], 'respo')).toBe(true);
        expect(signsBothSteps(['RESPO'], 'respo')).toBe(false);
        expect(signsBothSteps(['PRESIDENT'], 'president')).toBe(false);
        expect(signsBothSteps(['PRESIDENT'], 'legacy')).toBe(false);
    });
});

describe('activeUlId', () => {
    it('retombe sur l\'UL par défaut des routes', () => {
        expect(activeUlId('ul-x')).toBe('ul-x');
        expect(activeUlId(null)).toBe('ul-paris-18');
        expect(activeUlId(undefined)).toBe('ul-paris-18');
    });
});

describe('canViewExpense', () => {
    const note = { userId: 'u-owner', status: 'soumis', ulId: 'ul-a' };

    it('le demandeur voit sa note', () => {
        expect(canViewExpense({ id: 'u-owner', roles: [] }, note)).toBe(true);
    });

    it('le président et le super admin voient toute note', () => {
        expect(canViewExpense({ id: 'x', roles: ['PRESIDENT'], ulId: 'ul-b' }, note)).toBe(true);
        expect(canViewExpense({ id: 'x', roles: ['SUPER_ADMIN'] }, note)).toBe(true);
    });

    it('le trésorier ne voit que les notes en attente de paiement', () => {
        expect(canViewExpense({ id: 'x', roles: ['TRESORIER'] }, note)).toBe(false);
        expect(canViewExpense({ id: 'x', roles: ['TRESORIER'] }, { ...note, status: 'en_attente_paiement' })).toBe(true);
    });

    it('le RESPO voit les notes non brouillon de son UL active seulement', () => {
        const respo = { id: 'x', roles: ['RESPO'], ulId: 'ul-a' };
        expect(canViewExpense(respo, note)).toBe(true);
        expect(canViewExpense(respo, { ...note, status: 'valide_respo' })).toBe(true);
        expect(canViewExpense(respo, { ...note, status: 'brouillon' })).toBe(false);
        expect(canViewExpense({ ...respo, ulId: 'ul-b' }, note)).toBe(false);
        expect(canViewExpense({ ...respo, roles: ['RESPO', 'INACTIF'] }, note)).toBe(false);
    });

    it('une note sans UL relève de l\'UL par défaut, comme dans les routes', () => {
        const respo = { id: 'x', roles: ['RESPO'], ulId: 'ul-paris-18' };
        expect(canViewExpense(respo, { ...note, ulId: null })).toBe(true);
        expect(canViewExpense({ ...respo, ulId: 'ul-a' }, { ...note, ulId: null })).toBe(false);
    });

    it('refuse un autre membre', () => {
        expect(canViewExpense({ id: 'x', roles: ['CHVL'], ulId: 'ul-a' }, note)).toBe(false);
    });
});
