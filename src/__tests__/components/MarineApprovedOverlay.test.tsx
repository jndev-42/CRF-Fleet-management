import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarineApprovedOverlay from '@/components/ui/MarineApprovedOverlay';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('MarineApprovedOverlay', () => {
    it('n\'affiche ni image ni tampon avant le premier délai', () => {
        render(<MarineApprovedOverlay onAnimationComplete={vi.fn()} />);
        expect(screen.queryByAltText('MARINE APPROVED')).toBeNull();
        expect(screen.queryByText('MARINE APPROVED')).toBeNull();
    });

    it('affiche l\'image après 100ms', () => {
        render(<MarineApprovedOverlay onAnimationComplete={vi.fn()} />);
        act(() => { vi.advanceTimersByTime(150); });
        expect(screen.getByAltText('MARINE APPROVED')).toBeTruthy();
    });

    it('affiche le tampon après 1500ms (happy path)', () => {
        render(<MarineApprovedOverlay onAnimationComplete={vi.fn()} />);
        act(() => { vi.advanceTimersByTime(1600); });
        expect(screen.getByText('MARINE APPROVED')).toBeTruthy();
    });

    it('appelle onAnimationComplete après 3700ms', () => {
        const onAnimationComplete = vi.fn();
        render(<MarineApprovedOverlay onAnimationComplete={onAnimationComplete} />);
        act(() => { vi.advanceTimersByTime(3700); });
        expect(onAnimationComplete).toHaveBeenCalled();
    });

    it('utilise un texte de tampon personnalisé', () => {
        render(<MarineApprovedOverlay onAnimationComplete={vi.fn()} stampText="APPROUVÉ" />);
        act(() => { vi.advanceTimersByTime(1600); });
        expect(screen.getByText('APPROUVÉ')).toBeTruthy();
    });

    it('nettoie les timers au démontage', () => {
        const onAnimationComplete = vi.fn();
        const { unmount } = render(<MarineApprovedOverlay onAnimationComplete={onAnimationComplete} />);
        unmount();
        act(() => { vi.advanceTimersByTime(4000); });
        expect(onAnimationComplete).not.toHaveBeenCalled();
    });
});
