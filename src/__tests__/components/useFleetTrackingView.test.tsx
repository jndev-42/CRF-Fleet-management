/**
 * Tests de la bascule « Flotte / Suivi technique » de `/vehicles` (URL ↔ état) et
 * de son bouton.
 *
 * Fichiers testés : src/app/vehicles/useFleetTrackingView.ts, src/app/vehicles/FleetViewToggle.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
    useSearchParams: () => nav.params,
    usePathname: () => '/vehicles',
    useRouter: () => ({ replace: nav.replace }),
}));

import { useFleetTrackingView } from '@/app/vehicles/useFleetTrackingView';
import FleetViewToggle from '@/app/vehicles/FleetViewToggle';

function lastUrl(): string {
    return nav.replace.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.replace.mockReset();
});

describe('useFleetTrackingView', () => {
    it('passer en suivi écrit vue=suivi&onglet=taches (onglet par défaut) sans empiler d\'historique', () => {
        const { result } = renderHook(() => useFleetTrackingView(true));
        expect(result.current.isTracking).toBe(false);
        act(() => result.current.setTracking(true));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=taches');
        expect(nav.replace.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
    });

    it('lit la vue suivi depuis l\'URL, et revenir à la flotte retire les paramètres', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=contacts&autre=1');
        const { result } = renderHook(() => useFleetTrackingView(true));
        expect(result.current.isTracking).toBe(true);
        expect(result.current.tab).toBe('contacts');
        act(() => result.current.setTracking(false));
        expect(lastUrl()).toBe('/vehicles?autre=1');
    });

    it('ignore vue=suivi sans droit (CHVL, Vue DT)', () => {
        nav.params = new URLSearchParams('vue=suivi');
        const { result } = renderHook(() => useFleetTrackingView(false));
        expect(result.current.isTracking).toBe(false);
    });

    it('un onglet inconnu retombe sur Tâches', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=nimporte');
        const { result } = renderHook(() => useFleetTrackingView(true));
        expect(result.current.tab).toBe('taches');
    });

    it('lien de dossier : lit le dossier à ouvrir ; revenir à la liste retire `dossier`', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=dossiers&dossier=d-7');
        const { result } = renderHook(() => useFleetTrackingView(true));
        expect(result.current.tab).toBe('dossiers');
        expect(result.current.dossierId).toBe('d-7');
        expect(result.current.taskId).toBeNull();
        act(() => result.current.setDossierId(null));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=dossiers');
        act(() => result.current.setDossierId('d-8'));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=dossiers&dossier=d-8');
        // Changer d'onglet referme le dossier.
        act(() => result.current.setTab('taches'));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=taches');
    });

    it('lien de notification : lit la tâche à ouvrir ; la fermer retire `tache` de l\'URL', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=taches&tache=t-42');
        const { result } = renderHook(() => useFleetTrackingView(true));
        expect(result.current.tab).toBe('taches');
        expect(result.current.taskId).toBe('t-42');
        act(() => result.current.setTaskId(null));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=taches');
    });

    it('ouvrir une tâche l\'écrit dans l\'URL ; changer d\'onglet la retire', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=taches');
        const { result } = renderHook(() => useFleetTrackingView(true));
        act(() => result.current.setTaskId('t-7'));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=taches&tache=t-7');
        nav.params = new URLSearchParams('vue=suivi&onglet=taches&tache=t-7');
        const { result: again } = renderHook(() => useFleetTrackingView(true));
        act(() => again.current.setTab('contacts'));
        expect(lastUrl()).toBe('/vehicles?vue=suivi&onglet=contacts');
    });

    it('sans droit, `tache` est ignorée', () => {
        nav.params = new URLSearchParams('vue=suivi&onglet=taches&tache=t-42');
        const { result } = renderHook(() => useFleetTrackingView(false));
        expect(result.current.taskId).toBeNull();
    });
});

describe('FleetViewToggle', () => {
    it('signale la vue active et transmet le choix', () => {
        const onChange = vi.fn();
        render(<FleetViewToggle isTracking={false} onChange={onChange} />);
        expect(screen.getByRole('button', { name: /Flotte/ }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: /Suivi technique/ }));
        expect(onChange).toHaveBeenCalledWith(true);
    });
});
