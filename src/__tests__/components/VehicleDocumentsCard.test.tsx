import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// La liseuse charge pdf.js : remplacée ici par un double, testée à part.
vi.mock('@/components/ui/PdfReader', () => ({
    default: ({ src, fileName, onClose }: { src: string; fileName: string; onClose: () => void }) => (
        <div role="dialog" aria-label={`Liseuse ${fileName}`} data-src={src}>
            <button onClick={onClose}>Fermer</button>
        </div>
    ),
}));

import VehicleDocumentsCard from '@/components/vehicle/VehicleDocumentsCard';

const DOCS = [
    { id: 'd1', fileName: 'VPSP 182.pdf', size: 1.3 * 1024 * 1024, createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'd2', fileName: 'Carte grise.pdf', size: 52 * 1024, createdAt: '2026-10-02T10:00:00.000Z' },
];
const documentUrl = (id: string) => `/api/qr/tok/documents/${id}`;

describe('VehicleDocumentsCard', () => {
    it('liste chaque document avec son nom, sa taille et sa date', () => {
        render(<VehicleDocumentsCard documents={DOCS} documentUrl={documentUrl} />);
        expect(screen.getByText('Documents liés au véhicule')).toBeTruthy();
        expect(screen.getByText('VPSP 182.pdf')).toBeTruthy();
        expect(screen.getByText('Carte grise.pdf')).toBeTruthy();
        expect(screen.getByText(/1,3 Mo · ajouté le 01\/10\/2026/)).toBeTruthy();
        expect(screen.getByText(/52 Ko · ajouté le 02\/10\/2026/)).toBeTruthy();
    });

    it('le lien Télécharger de chaque document pointe vers ?download=1 avec son nom d\'origine', () => {
        render(<VehicleDocumentsCard documents={DOCS} documentUrl={documentUrl} />);
        const link = screen.getByRole('link', { name: 'Télécharger Carte grise.pdf' });
        expect(link.getAttribute('href')).toBe('/api/qr/tok/documents/d2?download=1');
        expect(link.getAttribute('download')).toBe('Carte grise.pdf');
    });

    it('Lire ouvre la liseuse sur CE document, Fermer la referme', () => {
        render(<VehicleDocumentsCard documents={DOCS} documentUrl={documentUrl} />);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Lire Carte grise.pdf' }));
        const dialog = screen.getByRole('dialog', { name: 'Liseuse Carte grise.pdf' });
        expect(dialog.getAttribute('data-src')).toBe('/api/qr/tok/documents/d2');

        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
