import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const demo = vi.hoisted(() => ({ isDemoMode: true, toggleDemoMode: vi.fn() }));
vi.mock('@/lib/contexts/DemoContext', () => ({ useDemoMode: () => demo }));

import DemoBanner from '@/components/DemoBanner';
import { DEMO_SIMULATED_EVENT } from '@/lib/demo/readOnly';

describe('DemoBanner', () => {
    it('affiche le texte de la base partagée et le message de simulation externe', () => {
        vi.useFakeTimers();
        render(<DemoBanner />);
        expect(screen.getByText(/Base de démonstration partagée, remise à zéro chaque nuit ou à la demande/)).toBeTruthy();
        expect(screen.getByText(/jamais dans la base réelle/)).toBeTruthy();
        expect(screen.queryByText(/Action simulée/)).toBeNull();
        act(() => { window.dispatchEvent(new CustomEvent(DEMO_SIMULATED_EVENT)); });
        expect(screen.getByText(/Action simulée : fichiers, véhicules connectés et notifications/)).toBeTruthy();
        act(() => { vi.advanceTimersByTime(4100); });
        expect(screen.queryByText(/Action simulée/)).toBeNull();
        vi.useRealTimers();
    });

    it('ne rend rien hors démo', () => {
        demo.isDemoMode = false;
        const { container } = render(<DemoBanner />);
        expect(container.innerHTML).toBe('');
        demo.isDemoMode = true;
    });
});
