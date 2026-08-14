import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();
vi.mock('next-themes', () => ({ useTheme: () => mockUseTheme() }));

import { ThemeToggle } from '@/components/ThemeToggle';

beforeEach(() => {
    mockSetTheme.mockReset();
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });
});

describe('ThemeToggle', () => {
    it('affiche une icône Lune en thème clair après le montage', async () => {
        render(<ThemeToggle />);
        await waitFor(() => expect(screen.getByRole('button')).toBeTruthy());
        expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Passer en mode sombre');
    });

    it('affiche une icône Soleil en thème sombre', async () => {
        mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });
        render(<ThemeToggle />);
        await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Passer en mode clair'));
    });

    it('bascule vers le mode sombre au clic depuis le mode clair (happy path)', async () => {
        render(<ThemeToggle />);
        await waitFor(() => screen.getByRole('button'));
        fireEvent.click(screen.getByRole('button'));
        expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('bascule vers le mode clair au clic depuis le mode sombre', async () => {
        mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });
        render(<ThemeToggle />);
        await waitFor(() => screen.getByRole('button'));
        fireEvent.click(screen.getByRole('button'));
        expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
});
