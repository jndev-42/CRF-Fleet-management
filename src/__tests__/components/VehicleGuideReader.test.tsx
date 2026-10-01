import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 842 * scale, height: 595 * scale }),
    render: renderPage,
}));
const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 7, getPage }),
    destroy: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument,
}));

import VehicleGuideReader from '@/components/vehicle/VehicleGuideReader';

beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 }));
    // jsdom ne calcule aucune mise en page : on fixe une largeur pour déclencher le rendu.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    renderPage.mockClear();
    getPage.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('VehicleGuideReader', () => {
    it('affiche la première page et le compteur n / N', async () => {
        render(<VehicleGuideReader src="/api/vehicles/VL1/guide" fileName="VPSP 182.pdf" onClose={vi.fn()} />);
        expect(screen.getByRole('dialog', { name: 'Guide de vérification : VPSP 182.pdf' })).toBeTruthy();
        expect(await screen.findByText('1 / 7')).toBeTruthy();
        await waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
        expect(global.fetch).toHaveBeenCalledWith('/api/vehicles/VL1/guide');
    });

    it('navigue avec les boutons et les flèches du clavier, dans les bornes', async () => {
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        await screen.findByText('1 / 7');

        expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(screen.getByText('2 / 7')).toBeTruthy();

        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(screen.getByText('3 / 7')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(screen.getByText('2 / 7')).toBeTruthy();
        await waitFor(() => expect(getPage).toHaveBeenCalledWith(3));
    });

    it('tourne la page au glissé horizontal', async () => {
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        await screen.findByText('1 / 7');
        const canvas = document.querySelector('canvas')!;
        const viewport = canvas.parentElement!;
        fireEvent.touchStart(viewport, { touches: [{ clientX: 300, clientY: 200 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 100, clientY: 210 }] });
        expect(screen.getByText('2 / 7')).toBeTruthy();
    });

    it('ignore un pincement, un défilement vertical ou diagonal, et une page zoomée', async () => {
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        await screen.findByText('1 / 7');
        const viewport = document.querySelector('canvas')!.parentElement!;

        // Pincement : deux doigts au départ.
        fireEvent.touchStart(viewport, { touches: [{ clientX: 300, clientY: 200 }, { clientX: 100, clientY: 200 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 100, clientY: 200 }] });
        // Défilement diagonal : |dy| ≥ |dx|.
        fireEvent.touchStart(viewport, { touches: [{ clientX: 300, clientY: 400 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 200, clientY: 100 }] });
        expect(screen.getByText('1 / 7')).toBeTruthy();

        // Page zoomée.
        const original = window.visualViewport;
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: { scale: 2 } });
        try {
            fireEvent.touchStart(viewport, { touches: [{ clientX: 300, clientY: 200 }] });
            fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 100, clientY: 200 }] });
            expect(screen.getByText('1 / 7')).toBeTruthy();
        } finally {
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: original });
        }
    });

    it('se ferme par le bouton ou par Échap', async () => {
        const onClose = vi.fn();
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('affiche le message du serveur si le guide est inaccessible', async () => {
        vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Aucun guide de vérification pour ce véhicule' }), { status: 404 }));
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        expect((await screen.findByRole('alert')).textContent).toBe('Aucun guide de vérification pour ce véhicule');
    });

    it('propose le téléchargement sous le nom d\'origine', () => {
        render(<VehicleGuideReader src="/api/qr/tok/guide" fileName="VPSP 182.pdf" onClose={vi.fn()} />);
        const link = screen.getByRole('link', { name: 'Télécharger le guide' });
        expect(link.getAttribute('href')).toBe('/api/qr/tok/guide?download=1');
    });
});
