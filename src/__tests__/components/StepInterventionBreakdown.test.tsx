import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StepInterventionBreakdown from '@/components/missions/steps/StepInterventionBreakdown';

function renderStep(overrides: Partial<React.ComponentProps<typeof StepInterventionBreakdown>> = {}) {
    const props = {
        victimCount: 3,
        interventionTypes: {},
        interventionNatures: {},
        onTypeChange: vi.fn(),
        onNatureChange: vi.fn(),
        ...overrides,
    };
    render(<StepInterventionBreakdown {...props} />);
    return props;
}

describe('StepInterventionBreakdown', () => {
    it('affiche les cinq libellés de la grille « type de prise en charge »', () => {
        renderStep();
        expect(screen.getByText('Nombre de soins (sans décharge, ni évac)')).toBeTruthy();
        expect(screen.getByText('Nombre de décharge')).toBeTruthy();
        expect(screen.getByText('Nombre de mise en oeuvre DAE')).toBeTruthy();
        expect(screen.getByText("Nombre d'évac CRF")).toBeTruthy();
        expect(screen.getByText("Nombre d'évac Autres")).toBeTruthy();
    });

    it('affiche les cinq libellés de la grille « nature »', () => {
        renderStep();
        expect(screen.getByText('Petits soins')).toBeTruthy();
        expect(screen.getByText('Malaise')).toBeTruthy();
        expect(screen.getByText('Traumatisme')).toBeTruthy();
        expect(screen.getByText('Inconscience')).toBeTruthy();
        expect(screen.getByText('Arrêt cardiaque')).toBeTruthy();
    });

    it('affiche les deux compteurs « courant / cible » à 0 au départ', () => {
        renderStep();
        expect(screen.getAllByText('0 / 3')).toHaveLength(2);
    });

    it('met à jour le compteur du groupe « type » selon les quantités saisies', () => {
        renderStep({ interventionTypes: { SOINS: 2, DAE: 1 } });
        expect(screen.getByText('3 / 3')).toBeTruthy();
        expect(screen.getByText('0 / 3')).toBeTruthy();
    });

    it('compte séparément les deux grilles', () => {
        renderStep({ interventionTypes: { SOINS: 3 }, interventionNatures: { MALAISE: 1 } });
        expect(screen.getByText('3 / 3')).toBeTruthy();
        expect(screen.getByText('1 / 3')).toBeTruthy();
    });

    it('remonte la saisie du groupe « type » via onTypeChange', () => {
        const { onTypeChange } = renderStep();
        fireEvent.change(screen.getByLabelText('Nombre de décharge'), { target: { value: '2' } });
        expect(onTypeChange).toHaveBeenCalledWith('DECHARGE', 2);
    });

    it('remonte la saisie du groupe « nature » via onNatureChange', () => {
        const { onNatureChange } = renderStep();
        fireEvent.change(screen.getByLabelText('Traumatisme'), { target: { value: '1' } });
        expect(onNatureChange).toHaveBeenCalledWith('TRAUMATISME', 1);
    });

    it('refuse les quantités négatives', () => {
        const { onTypeChange } = renderStep();
        fireEvent.change(screen.getByLabelText('Nombre de décharge'), { target: { value: '-4' } });
        expect(onTypeChange).toHaveBeenCalledWith('DECHARGE', 0);
    });

    it('accorde le sous-titre au singulier pour une seule intervention', () => {
        renderStep({ victimCount: 1 });
        expect(screen.getByText(/Répartissez les 1 intervention dans les deux grilles/)).toBeTruthy();
    });
});
