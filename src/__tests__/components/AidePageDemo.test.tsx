/** Carte « Mode Démo » de la page Aide : visibilité du bouton d'entrée et de la recopie. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const demo = vi.hoisted(() => ({
    isDemoMode: false,
    isDemoAvailable: false,
    canRefreshDemo: false,
    isDemoRefreshing: false,
    markDemoRefreshing: vi.fn(),
    refreshDemoStatus: vi.fn(),
    toggleDemoMode: vi.fn(),
}));
vi.mock('@/lib/contexts/DemoContext', () => ({ useDemoMode: () => demo }));
vi.mock('@/lib/contexts/ULContext', () => ({ useUL: () => ({ activeUL: null }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AidePage from '@/app/aide/page';

const entry = () => screen.queryByRole('button', { name: /Activer le mode démo|Quitter le mode démo/ });
const refresh = () => screen.queryByRole('button', { name: /Recopier la base démo/ });
const card = () => screen.queryByRole('heading', { name: /Mode Démo/ });

describe('Page Aide — carte Mode Démo', () => {
    beforeEach(() => {
        Object.assign(demo, { isDemoMode: false, isDemoAvailable: false, canRefreshDemo: false, isDemoRefreshing: false });
        vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ uls: [] })));
    });
    afterEach(() => vi.restoreAllMocks());

    it('compte ordinaire, démo prête : bouton d\'entrée, aucune recopie', () => {
        demo.isDemoAvailable = true;
        render(<AidePage />);
        expect(entry()).not.toBeNull();
        expect(refresh()).toBeNull();
    });

    it('compte ordinaire, démo indisponible : pas de carte', () => {
        render(<AidePage />);
        expect(card()).toBeNull();
        expect(entry()).toBeNull();
        expect(refresh()).toBeNull();
    });

    it('SUPER_ADMIN, démo prête : recopie sous le bouton d\'entrée', () => {
        Object.assign(demo, { isDemoAvailable: true, canRefreshDemo: true });
        render(<AidePage />);
        const [entryButton, refreshButton] = [entry(), refresh()];
        expect(entryButton).not.toBeNull();
        expect(refreshButton).not.toBeNull();
        expect(entryButton!.compareDocumentPosition(refreshButton!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('SUPER_ADMIN, démo jamais recopiée : carte et recopie, sans bouton d\'entrée', () => {
        demo.canRefreshDemo = true;
        render(<AidePage />);
        expect(card()).not.toBeNull();
        expect(entry()).toBeNull();
        expect(refresh()).not.toBeNull();
        expect(screen.getByText("La base de démonstration n'est pas disponible. Lancez une recopie pour la rendre accessible.")).toBeTruthy();
    });

    it("copie en cours (statut encore prêt dans cet onglet) : pas de bouton d'entrée, texte de copie", () => {
        Object.assign(demo, { isDemoAvailable: true, canRefreshDemo: true, isDemoRefreshing: true });
        render(<AidePage />);
        expect(entry()).toBeNull();
        expect(refresh()).not.toBeNull();
        expect(screen.getByText('Recopie de la base de démonstration en cours.')).toBeTruthy();
    });

    it('copie en cours, personne déjà en démo : peut toujours quitter', () => {
        Object.assign(demo, { isDemoMode: true, isDemoRefreshing: true });
        render(<AidePage />);
        expect(entry()?.textContent).toMatch(/Quitter le mode démo/);
        expect(screen.getByText(/remise à zéro chaque nuit ou à la demande/)).toBeTruthy();
    });

    it('SUPER_ADMIN en mode démo : recopie masquée', () => {
        Object.assign(demo, { isDemoMode: true, isDemoAvailable: true, canRefreshDemo: true });
        render(<AidePage />);
        expect(entry()).not.toBeNull();
        expect(refresh()).toBeNull();
    });
});
