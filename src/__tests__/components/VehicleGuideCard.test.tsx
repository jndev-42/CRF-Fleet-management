import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// La liseuse charge pdf.js : remplacée ici par un double, testée à part.
vi.mock('@/components/vehicle/VehicleGuideReader', () => ({
    default: ({ src, fileName, onClose }: { src: string; fileName: string; onClose: () => void }) => (
        <div role="dialog" aria-label={`Liseuse ${fileName}`} data-src={src}>
            <button onClick={onClose}>Fermer</button>
        </div>
    ),
}));

import VehicleGuideCard from '@/components/vehicle/VehicleGuideCard';

describe('VehicleGuideCard', () => {
    it('affiche le nom, la taille et la date du guide', () => {
        render(<VehicleGuideCard src="/api/vehicles/VPSP%20182/guide" fileName="VPSP 182.pdf" size={1.3 * 1024 * 1024} updatedAt="2026-10-01T10:00:00.000Z" />);
        expect(screen.getByText('Guide de vérification')).toBeTruthy();
        expect(screen.getByText('VPSP 182.pdf')).toBeTruthy();
        expect(screen.getByText(/1,3 Mo · mis à jour le 01\/10\/2026/)).toBeTruthy();
    });

    it('le lien Télécharger pointe vers ?download=1 avec le nom d\'origine', () => {
        render(<VehicleGuideCard src="/api/qr/tok/guide" fileName="VPSP 182.pdf" />);
        const link = screen.getByRole('link', { name: /Télécharger/ });
        expect(link.getAttribute('href')).toBe('/api/qr/tok/guide?download=1');
        expect(link.getAttribute('download')).toBe('VPSP 182.pdf');
    });

    it('Lire ouvre la liseuse sur la source donnée, Fermer la referme', () => {
        render(<VehicleGuideCard src="/api/qr/tok/guide" fileName="VPSP 182.pdf" />);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Lire/ }));
        const dialog = screen.getByRole('dialog', { name: 'Liseuse VPSP 182.pdf' });
        expect(dialog.getAttribute('data-src')).toBe('/api/qr/tok/guide');

        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
