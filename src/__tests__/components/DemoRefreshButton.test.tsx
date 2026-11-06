import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const demo = vi.hoisted(() => ({
    isDemoMode: false,
    canRefreshDemo: true,
    markDemoRefreshing: vi.fn(),
    refreshDemoStatus: vi.fn(),
}));
vi.mock('@/lib/contexts/DemoContext', () => ({ useDemoMode: () => demo }));

import DemoRefreshButton from '@/components/demo/DemoRefreshButton';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

const button = () => screen.getByRole('button');

describe('DemoRefreshButton', () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        demo.isDemoMode = false;
        demo.canRefreshDemo = true;
        demo.markDemoRefreshing = vi.fn();
        demo.refreshDemoStatus = vi.fn().mockResolvedValue(undefined);
        confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        fetchSpy = vi.spyOn(window, 'fetch');
    });

    afterEach(() => vi.restoreAllMocks());

    it('ne rend rien pour un compte qui ne peut pas recopier', () => {
        demo.canRefreshDemo = false;
        const { container } = render(<DemoRefreshButton />);
        expect(container.innerHTML).toBe('');
    });

    it('ne rend rien en mode démo', () => {
        demo.isDemoMode = true;
        const { container } = render(<DemoRefreshButton />);
        expect(container.innerHTML).toBe('');
    });

    it("annuler la confirmation n'appelle pas la route", () => {
        confirmSpy.mockReturnValue(false);
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('la confirmation annonce la perte des changements et la démo indisponible', () => {
        confirmSpy.mockReturnValue(false);
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        const message = confirmSpy.mock.calls[0][0] as string;
        expect(message).toMatch(/changements faits en démo seront perdus/);
        expect(message).toMatch(/indisponible pendant la copie/);
        expect(message).toMatch(/partagée entre tous ses utilisateurs/);
    });

    it('désactivé pendant la recopie, puis résultat affiché et statut relu', async () => {
        let resolve!: (r: Response) => void;
        fetchSpy.mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
        render(<DemoRefreshButton />);
        fireEvent.click(button());

        await waitFor(() => expect(button().textContent).toContain('Recopie en cours…'));
        expect((button() as HTMLButtonElement).disabled).toBe(true);
        expect(fetchSpy).toHaveBeenCalledWith('/api/demo/refresh', { method: 'POST' });

        resolve(json({ success: true, tables: 12, rows: 340, durationMs: 4200, purged: 3 }));

        expect((await screen.findByRole('status')).textContent).toBe('Base démo recopiée : 12 table(s), 340 ligne(s) en 4 s.');
        await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
        expect(demo.refreshDemoStatus).toHaveBeenCalledTimes(1);
    });

    it('signale des fichiers de démo non vidés (purged: null)', async () => {
        fetchSpy.mockResolvedValue(json({ success: true, tables: 1, rows: 1, durationMs: 1000, purged: null }));
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect((await screen.findByRole('status')).textContent).toMatch(/n'ont pas pu être vidés/);
    });

    it.each([
        [409, "Une recopie de la base de démonstration est déjà en cours ou vient de s'interrompre : réessayez dans quelques minutes."],
        [500, 'La recopie de la base de démonstration a échoué'],
    ])('affiche le message du serveur en %i et relit le statut', async (status, error) => {
        fetchSpy.mockResolvedValue(json({ error }, status));
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect((await screen.findByRole('alert')).textContent).toBe(error);
        await waitFor(() => expect(demo.refreshDemoStatus).toHaveBeenCalledTimes(1));
    });

    it('signale la recopie au contexte juste avant le POST', async () => {
        fetchSpy.mockResolvedValue(json({ success: true, tables: 1, rows: 1, durationMs: 1000, purged: 0 }));
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        await screen.findByRole('status');
        expect(demo.markDemoRefreshing).toHaveBeenCalledTimes(1);
        expect(demo.markDemoRefreshing.mock.invocationCallOrder[0]).toBeLessThan(fetchSpy.mock.invocationCallOrder[0]);
    });

    it("annuler la confirmation ne signale aucune recopie", () => {
        confirmSpy.mockReturnValue(false);
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect(demo.markDemoRefreshing).not.toHaveBeenCalled();
    });

    it('réponse non JSON (fonction coupée) : invite à vérifier et réessayer plus tard', async () => {
        fetchSpy.mockResolvedValue(new Response('<html>504</html>', { status: 504 }));
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect((await screen.findByRole('alert')).textContent).toBe("Le serveur n'a pas répondu à temps : vérifiez l'état de la démo et réessayez dans quelques minutes.");
    });

    it('panne réseau : invite à vérifier avant de relancer, bouton réactivé', async () => {
        fetchSpy.mockRejectedValue(new Error('network'));
        render(<DemoRefreshButton />);
        fireEvent.click(button());
        expect((await screen.findByRole('alert')).textContent).toMatch(/Pas de réponse du serveur/);
        await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
        expect(demo.refreshDemoStatus).toHaveBeenCalledTimes(1);
    });
});
