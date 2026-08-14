import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SignedReportLightbox from '@/components/missions/SignedReportLightbox';

describe('SignedReportLightbox', () => {
    it('affiche l\'image du rapport signé par défaut (happy path)', () => {
        render(<SignedReportLightbox driveId="drive-1" onClose={vi.fn()} />);
        expect(screen.getByAltText('Rapport de mission signé')).toBeTruthy();
        expect((screen.getByAltText('Rapport de mission signé') as HTMLImageElement).src).toContain('/api/drive/photos/drive-1');
    });

    it('bascule sur un iframe PDF si l\'image échoue à charger', () => {
        render(<SignedReportLightbox driveId="drive-1" onClose={vi.fn()} />);
        fireEvent.error(screen.getByAltText('Rapport de mission signé'));

        expect(screen.getByTitle('Rapport signé (PDF)')).toBeTruthy();
        expect(screen.queryByAltText('Rapport de mission signé')).toBeNull();
    });

    it('appelle onClose au clic sur le fond', () => {
        const onClose = vi.fn();
        const { container } = render(<SignedReportLightbox driveId="drive-1" onClose={onClose} />);
        fireEvent.click(container.firstChild as Element);
        expect(onClose).toHaveBeenCalled();
    });

    it('appelle onClose au clic sur le bouton de fermeture', () => {
        const onClose = vi.fn();
        render(<SignedReportLightbox driveId="drive-1" onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('ne propage pas le clic sur l\'image au fond', () => {
        const onClose = vi.fn();
        render(<SignedReportLightbox driveId="drive-1" onClose={onClose} />);
        fireEvent.click(screen.getByAltText('Rapport de mission signé'));
        expect(onClose).not.toHaveBeenCalled();
    });
});
