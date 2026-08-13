import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleInteractiveSVG from '@/components/vehicle/VehicleInteractiveSVG';

describe('VehicleInteractiveSVG', () => {
    it('appelle onZoneClick avec l\'id de la zone cliquée', () => {
        const onZoneClick = vi.fn();
        render(<VehicleInteractiveSVG selectedZones={[]} onZoneClick={onZoneClick} />);

        fireEvent.click(screen.getByRole('button', { name: 'Avant' }));

        expect(onZoneClick).toHaveBeenCalledWith('front');
    });

    it('applique la variable de thème de sélection (pas de hex en dur) sur une zone sélectionnée', () => {
        render(<VehicleInteractiveSVG selectedZones={['front']} onZoneClick={vi.fn()} />);

        const zoneButton = screen.getByRole('button', { name: 'Avant' });
        expect(zoneButton.getAttribute('style')).toContain('var(--status-maintenance)');
    });
});
