import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataCorrectionFields from '@/components/vehicle/DataCorrectionFields';

function renderFields(overrides: Partial<Parameters<typeof DataCorrectionFields>[0]> = {}) {
    const props = {
        idPrefix: 'test',
        connected: false,
        fuelType: 'Diesel',
        dataIncorrect: true,
        correctedMileage: 12000 as number | '',
        correctedFuel: 40,
        knownMileage: 12000,
        onDataIncorrectChange: vi.fn(),
        onMileageChange: vi.fn(),
        onFuelChange: vi.fn(),
        ...overrides,
    };
    render(<DataCorrectionFields {...props} />);
    return props;
}

describe('DataCorrectionFields (bloc partagé modale / QR)', () => {
    it('masque les champs tant que la case n\'est pas cochée', () => {
        const props = renderFields({ dataIncorrect: false });
        expect(screen.queryByLabelText(/Kilométrage réel/)).toBeNull();
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        expect(props.onDataIncorrectChange).toHaveBeenCalledWith(true);
    });

    it('libellé « Saisir manuellement » pour un véhicule connecté', () => {
        renderFields({ connected: true, dataIncorrect: false });
        expect(screen.getByLabelText(/Saisir manuellement le kilométrage\/carburant/)).toBeTruthy();
    });

    it('préfixe les id pour que deux formulaires coexistent', () => {
        renderFields({ idPrefix: 'qr-checkout' });
        expect(screen.getByLabelText(/Kilométrage réel/).id).toBe('qr-checkout-corrected-mileage');
        expect(screen.getByLabelText(/Diesel réel/).id).toBe('qr-checkout-corrected-fuel');
    });

    it('un champ effacé remonte une chaîne vide, jamais 0', () => {
        const props = renderFields();
        fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '' } });
        expect(props.onMileageChange).toHaveBeenCalledWith('');
    });

    it('remonte le kilométrage et le niveau saisis', () => {
        const props = renderFields();
        fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '12500' } });
        fireEvent.change(screen.getByLabelText(/Diesel réel/), { target: { value: '70' } });
        expect(props.onMileageChange).toHaveBeenCalledWith(12500);
        expect(props.onFuelChange).toHaveBeenCalledWith(70);
    });

    it('avertit d\'une baisse, pas d\'une hausse ni d\'un champ vide', () => {
        renderFields({ correctedMileage: 1200 });
        expect(screen.getByText(/Inférieur au kilométrage connu \(12.000 km\)/)).toBeTruthy();
    });

    it.each([[12500], ['' as const]])('pas d\'avertissement pour %s', (correctedMileage) => {
        renderFields({ correctedMileage });
        expect(screen.queryByText(/Inférieur au kilométrage connu/)).toBeNull();
    });

    it('libellé « Batterie » pour un véhicule électrique', () => {
        renderFields({ fuelType: 'Électrique' });
        expect(screen.getByLabelText(/Batterie réel : 40%/)).toBeTruthy();
    });
});
