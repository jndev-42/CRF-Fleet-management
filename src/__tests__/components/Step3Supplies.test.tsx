import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Step3Supplies from '@/components/missions/steps/Step3Supplies';

describe('Step3Supplies', () => {
    it('ouvre la catégorie "Sac primaire" par défaut', () => {
        render(<Step3Supplies supplies={{}} onSupplyChange={vi.fn()} />);
        expect(screen.getByText('Sérum physiologique')).toBeTruthy();
    });

    it('masque le contenu des autres catégories par défaut', () => {
        render(<Step3Supplies supplies={{}} onSupplyChange={vi.fn()} />);
        expect(screen.queryByText('Brûle-stop / Burnshield')).toBeNull();
    });

    it('déplie une catégorie au clic sur son en-tête', () => {
        render(<Step3Supplies supplies={{}} onSupplyChange={vi.fn()} />);
        fireEvent.click(screen.getByText('Brûlures'));
        expect(screen.getByText('Brûle-stop / Burnshield')).toBeTruthy();
    });

    it('replie une catégorie déjà ouverte', () => {
        render(<Step3Supplies supplies={{}} onSupplyChange={vi.fn()} />);
        fireEvent.click(screen.getByText('Sac primaire'));
        expect(screen.queryByText('Sérum physiologique')).toBeNull();
    });

    it('affiche le total d\'unités consommées dans le badge (happy path)', () => {
        render(<Step3Supplies supplies={{ 'SAC_PRIMAIRE__Compresses': 3 }} onSupplyChange={vi.fn()} />);
        expect(screen.getByText('3 unités')).toBeTruthy();
    });

    it('met à jour la quantité au changement de valeur', () => {
        const onSupplyChange = vi.fn();
        render(<Step3Supplies supplies={{}} onSupplyChange={onSupplyChange} />);
        const input = screen.getAllByDisplayValue('0')[0];
        fireEvent.change(input, { target: { value: '5' } });
        expect(onSupplyChange).toHaveBeenCalledWith(expect.stringContaining('SAC_PRIMAIRE__'), 5);
    });

    it('refuse les quantités négatives', () => {
        const onSupplyChange = vi.fn();
        render(<Step3Supplies supplies={{}} onSupplyChange={onSupplyChange} />);
        const input = screen.getAllByDisplayValue('0')[0];
        fireEvent.change(input, { target: { value: '-3' } });
        expect(onSupplyChange).toHaveBeenCalledWith(expect.any(String), 0);
    });
});
