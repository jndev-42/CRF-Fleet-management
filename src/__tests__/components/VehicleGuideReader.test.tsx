import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface RenderedViewport { width: number; height: number; rotation: number }
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature typée pour lire `mock.calls`
const renderPage = vi.fn((_params: { viewport: RenderedViewport }) => ({ promise: Promise.resolve(), cancel: vi.fn() }));
/** Viewport du dernier rendu de page. */
const lastViewport = () => renderPage.mock.calls.at(-1)![0].viewport;
// Page paysage 842 × 595 ; une rotation de 90° en inverse les dimensions.
const getPage = vi.fn(async () => ({
    rotate: 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => (rotation % 180
        ? { width: 595 * scale, height: 842 * scale, rotation }
        : { width: 842 * scale, height: 595 * scale, rotation }),
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
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    window.localStorage.clear();
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

    it('lit une URL directe par Range (sans fetch du fichier) et s\'ouvre à la page demandée', async () => {
        getDocument.mockClear();
        render(<VehicleGuideReader rangeUrl="https://r2.test/g.pdf?sig=1" initialPage={5} label="Référentiel secourisme" fileName="guide.pdf" onClose={vi.fn()} />);
        expect(screen.getByRole('dialog', { name: 'Référentiel secourisme : guide.pdf' })).toBeTruthy();
        expect(await screen.findByText('5 / 7')).toBeTruthy();
        await waitFor(() => expect(getPage).toHaveBeenCalledWith(5));
        expect(global.fetch).not.toHaveBeenCalled();
        expect(getDocument).toHaveBeenCalledWith({ url: 'https://r2.test/g.pdf?sig=1', disableAutoFetch: true, disableStream: true });
        // Une URL signée ne se télécharge pas avec « ?download=1 » : le bouton est masqué.
        expect(screen.queryByRole('link', { name: 'Télécharger le guide' })).toBeNull();
    });

    it('ramène une page demandée au-delà de la fin à la dernière page', async () => {
        render(<VehicleGuideReader rangeUrl="https://r2.test/g.pdf" initialPage={99} fileName="guide.pdf" onClose={vi.fn()} />);
        expect(await screen.findByText('7 / 7')).toBeTruthy();
        await waitFor(() => expect(getPage).toHaveBeenCalledWith(7));
        fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
        expect(screen.getByText('6 / 7')).toBeTruthy();
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

    it('pivote la page en paysage, ajustée pour tenir entière, et mémorise le choix', async () => {
        const { unmount } = render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        await waitFor(() => expect(renderPage).toHaveBeenCalled());
        expect(lastViewport().rotation).toBe(0);

        const toggle = screen.getByRole('button', { name: 'Afficher en paysage' });
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(toggle);

        await waitFor(() => expect(lastViewport().rotation).toBe(90));
        const rotated = lastViewport();
        // Zone 400 × 700, page pivotée 595 × 842 : 400/595 < 700/842, la largeur borne
        // l'échelle et la page tient entière (pas de défilement).
        const ratio = window.devicePixelRatio || 1;
        expect(rotated.width / ratio).toBeCloseTo(400, 0);
        expect(rotated.height / ratio).toBeLessThanOrEqual(700);
        expect(screen.getByRole('button', { name: 'Afficher en portrait' }).getAttribute('aria-pressed')).toBe('true');
        expect(window.localStorage.getItem('vehicleGuideReader.rotated')).toBe('1');

        unmount();
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Afficher en portrait' })).toBeTruthy();
    });

    it('page pivotée : tourne la page au glissé le long de la hauteur de l\'écran', async () => {
        window.localStorage.setItem('vehicleGuideReader.rotated', '1');
        render(<VehicleGuideReader src="/g" fileName="g.pdf" onClose={vi.fn()} />);
        await screen.findByText('1 / 7');
        const viewport = screen.getByRole('dialog').querySelector('canvas')!.parentElement!;

        // Glissé horizontal à l'écran : transversal une fois pivoté, ignoré.
        fireEvent.touchStart(viewport, { touches: [{ clientX: 300, clientY: 300 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 100, clientY: 310 }] });
        expect(screen.getByText('1 / 7')).toBeTruthy();

        // Vers le haut de l'écran = vers la gauche du lecteur : page suivante.
        fireEvent.touchStart(viewport, { touches: [{ clientX: 200, clientY: 500 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 210, clientY: 300 }] });
        expect(await screen.findByText('2 / 7')).toBeTruthy();

        fireEvent.touchStart(viewport, { touches: [{ clientX: 200, clientY: 300 }] });
        fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 210, clientY: 500 }] });
        expect(await screen.findByText('1 / 7')).toBeTruthy();
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
