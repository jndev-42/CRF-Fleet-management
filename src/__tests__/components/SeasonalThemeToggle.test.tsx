import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockSeasonal: { theme: string | null; hidden: boolean; toggleHidden: () => void } = {
    theme: null,
    hidden: false,
    toggleHidden: () => undefined,
};
vi.mock('@/lib/contexts/SeasonalThemeContext', () => ({
    useSeasonalTheme: () => mockSeasonal,
}));

import SeasonalThemeToggle from '@/components/themes/SeasonalThemeToggle';

beforeEach(() => {
    mockSeasonal = { theme: null, hidden: false, toggleHidden: vi.fn() };
});

function icon(): Element | null {
    return screen.getByRole('button').querySelector('svg');
}

describe('SeasonalThemeToggle', () => {
    it('ne rend rien sans thème actif', () => {
        const { container } = render(<SeasonalThemeToggle />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche un sapin pour le thème de Noël', () => {
        mockSeasonal = { theme: 'noel', hidden: false, toggleHidden: vi.fn() };
        render(<SeasonalThemeToggle />);
        expect(icon()?.getAttribute('class')).toContain('lucide-tree-pine');
    });

    it('affiche une grappe pour le thème des vendanges', () => {
        mockSeasonal = { theme: 'vendanges-montmartre', hidden: false, toggleHidden: vi.fn() };
        render(<SeasonalThemeToggle />);
        expect(icon()?.getAttribute('class')).toContain('lucide-grape');
    });

    it('affiche un fantôme pour le thème Halloween', () => {
        mockSeasonal = { theme: 'halloween', hidden: false, toggleHidden: vi.fn() };
        render(<SeasonalThemeToggle />);
        expect(icon()?.getAttribute('class')).toContain('lucide-ghost');
    });

    it('affiche un pictogramme neutre pour un thème sans icône dédiée', () => {
        mockSeasonal = { theme: 'inconnu', hidden: false, toggleHidden: vi.fn() };
        render(<SeasonalThemeToggle />);
        expect(icon()?.getAttribute('class')).toContain('lucide-sparkles');
    });

    it('bascule le thème et reflète l\'état masqué', () => {
        mockSeasonal = { theme: 'noel', hidden: true, toggleHidden: vi.fn() };
        render(<SeasonalThemeToggle />);
        const button = screen.getByLabelText('Afficher le thème');
        expect(button.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(button);
        expect(mockSeasonal.toggleHidden).toHaveBeenCalledTimes(1);
    });
});
