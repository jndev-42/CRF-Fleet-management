import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoleLegend from '@/components/users/RoleLegend';

describe('RoleLegend', () => {
    it('masque la légende par défaut', () => {
        render(<RoleLegend />);
        expect(screen.queryByText('Super Administrateur')).toBeNull();
    });

    it('affiche la légende des rôles au clic (happy path)', () => {
        render(<RoleLegend />);
        fireEvent.click(screen.getByText('ℹ️ Légende des rôles'));

        expect(screen.getByText('Super Administrateur')).toBeTruthy();
        expect(screen.getByText('Chauffeur VL')).toBeTruthy();
        expect(screen.getByText('Inactif')).toBeTruthy();
    });

    it('replie la légende à un second clic', () => {
        render(<RoleLegend />);
        const toggle = screen.getByText('ℹ️ Légende des rôles');
        fireEvent.click(toggle);
        expect(screen.getByText('Super Administrateur')).toBeTruthy();

        fireEvent.click(toggle);
        expect(screen.queryByText('Super Administrateur')).toBeNull();
    });
});
