import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VehiclePhoto from '@/components/vehicle/VehiclePhoto';

const SRC = '/api/vehicles/VL1/photo?v=1';
const THUMBNAIL = 'Agrandir la photo du véhicule VL1';

function openLightbox() {
    fireEvent.click(screen.getByRole('button', { name: THUMBNAIL }));
    return screen.getByRole('dialog', { name: 'Photo du véhicule VL1' });
}

describe('VehiclePhoto', () => {
    it('affiche la vignette, sans plein écran', () => {
        const { container } = render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        expect(container.querySelector('img')?.getAttribute('src')).toBe(SRC);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('un clic agrandit le même fichier et bloque le défilement', () => {
        render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        openLightbox();
        expect(screen.getByAltText('Véhicule VL1')?.getAttribute('src')).toBe(SRC);
        expect(document.body.style.overflow).toBe('hidden');
    });

    it('se ferme par le bouton et rétablit le défilement', () => {
        render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        openLightbox();
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.body.style.overflow).toBe('');
    });

    it('se ferme par un clic sur le fond, pas sur la photo', () => {
        render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        const dialog = openLightbox();
        fireEvent.click(screen.getByAltText('Véhicule VL1'));
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.click(dialog);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('se ferme par Échap et rend le focus à la vignette', () => {
        render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        openLightbox();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: THUMBNAIL }));
    });

    it('disparaît sans emplacement vide si la vignette est illisible', () => {
        const { container } = render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        fireEvent.error(container.querySelector('img')!);
        expect(container.innerHTML).toBe('');
    });

    it('disparaît et referme le plein écran si la photo agrandie est illisible', () => {
        const { container } = render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        openLightbox();
        fireEvent.error(screen.getByAltText('Véhicule VL1'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(container.innerHTML).toBe('');
    });

    it('retente le chargement quand une nouvelle photo remplace une image illisible', () => {
        const { container, rerender } = render(<VehiclePhoto src={SRC} vehicleName="VL1" />);
        fireEvent.error(container.querySelector('img')!);
        rerender(<VehiclePhoto src="/api/vehicles/VL1/photo?v=2" vehicleName="VL1" />);
        expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/vehicles/VL1/photo?v=2');
    });
});
