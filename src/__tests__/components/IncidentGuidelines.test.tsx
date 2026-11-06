import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import IncidentGuidelines from '@/components/vehicle/IncidentGuidelines';

describe('IncidentGuidelines', () => {
    it('ne contient plus de lorem ipsum', () => {
        const { container } = render(<IncidentGuidelines />);
        expect(container.textContent?.toLowerCase()).not.toContain('lorem');
    });

    it('affiche le titre des consignes', () => {
        render(<IncidentGuidelines />);
        expect(screen.getByText("Consignes en cas d'incident")).toBeTruthy();
    });

    it("propose d'appeler Onyx par téléphone", () => {
        render(<IncidentGuidelines />);
        const link = screen.getByRole('link', { name: '01 84 83 28 00' });
        expect(link.getAttribute('href')).toBe('tel:0184832800');
    });

    it('rend les numéros d’urgence cliquables', () => {
        render(<IncidentGuidelines />);
        for (const n of ['15', '18', '17', '112']) {
            expect(document.querySelector(`a[href="tel:${n}"]`)).toBeTruthy();
        }
    });

    it('couvre les sections accident, flash radar et délai de 24 heures', () => {
        render(<IncidentGuidelines />);
        expect(screen.getByText(/Accident ou incident de circulation/)).toBeTruthy();
        expect(screen.getByText(/Flash radar ou infraction/)).toBeTruthy();
        expect(screen.getByText(/dans les 24 heures/)).toBeTruthy();
    });
});
