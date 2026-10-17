import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    loadOpenCv: vi.fn(),
    detectQuad: vi.fn(),
    warpAndEnhance: vi.fn(),
    pagesToPdfFile: vi.fn(),
}));

vi.mock('@/lib/documentScanner/opencv', () => ({
    CAPTURE_ANALYSIS_SIZE: 1000,
    LIVE_ANALYSIS_SIZE: 480,
    loadOpenCv: mocks.loadOpenCv,
    detectQuad: mocks.detectQuad,
    warpAndEnhance: mocks.warpAndEnhance,
}));

vi.mock('@/lib/documentScanner/output', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/documentScanner/output')>();
    return { ...actual, pagesToPdfFile: mocks.pagesToPdfFile };
});

import DocumentScanner from '@/components/ui/DocumentScanner';

const QUAD = [
    { x: 50, y: 40 }, { x: 590, y: 40 }, { x: 590, y: 440 }, { x: 50, y: 440 },
];

function makeStream() {
    const stop = vi.fn();
    return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
}

function stubCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
}

function setup() {
    const props = { onComplete: vi.fn(), onClose: vi.fn(), onFallback: vi.fn() };
    const { unmount } = render(<DocumentScanner {...props} />);
    return { ...props, unmount };
}

describe('DocumentScanner', () => {
    let getUserMedia: ReturnType<typeof vi.fn>;
    let stop: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        const cam = makeStream();
        stop = cam.stop;
        getUserMedia = vi.fn().mockResolvedValue(cam.stream);
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640, configurable: true });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true });
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        stubCanvas();
        // history.back() est asynchrone en jsdom : son popstate fuirait sur le test suivant
        vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

        mocks.loadOpenCv.mockReset().mockResolvedValue({ fake: 'cv' });
        mocks.detectQuad.mockReset().mockReturnValue(QUAD);
        mocks.warpAndEnhance.mockReset().mockImplementation(() => document.createElement('canvas'));
        mocks.pagesToPdfFile.mockReset().mockImplementation(
            async () => new File(['pdf'], 'compte-rendu-scan.pdf', { type: 'application/pdf' }),
        );
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const shutter = () => screen.findByRole('button', { name: 'Prendre la photo' });
    const waitLive = async () => {
        await waitFor(() => expect((screen.getByRole('button', { name: 'Prendre la photo' }) as HTMLButtonElement).disabled).toBe(false));
    };

    it('propose le repli natif quand la caméra est refusée', async () => {
        getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
        const { onFallback, onComplete } = setup();

        expect(await screen.findByText('Accès caméra refusé')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /appareil photo du téléphone/i }));
        expect(onFallback).toHaveBeenCalledTimes(1);
        expect(onComplete).not.toHaveBeenCalled();
    });

    it("propose le repli natif quand le moteur ne se charge pas", async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.loadOpenCv.mockRejectedValue(new Error('wasm'));
        const { onFallback } = setup();

        expect(await screen.findByText(/scanner n’est pas disponible/i)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /appareil photo du téléphone/i }));
        expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('scan nominal : capture manuelle, ajustement, aperçu, PDF', async () => {
        const { onComplete } = setup();
        await waitLive();

        fireEvent.click(await shutter());
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /^Coin / })).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        expect(await screen.findByAltText('Document redressé')).toBeTruthy();
        expect(mocks.warpAndEnhance).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'original');

        fireEvent.click(screen.getByRole('button', { name: /Terminer/ }));
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
        const file = onComplete.mock.calls[0][0] as File;
        expect(file.name).toBe('compte-rendu-scan.pdf');
        expect(mocks.pagesToPdfFile).toHaveBeenCalledWith([expect.any(HTMLCanvasElement)]);
    });

    it('sans bord détecté : coins par défaut = cadre entier et déclencheur manuel actif', async () => {
        mocks.detectQuad.mockReturnValue(null);
        setup();
        await waitLive();

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        const quad = mocks.warpAndEnhance.mock.calls[0][2];
        expect(quad).toEqual([
            { x: 0, y: 0 }, { x: 640, y: 0 }, { x: 640, y: 480 }, { x: 0, y: 480 },
        ]);
    });

    it('propose Original / Couleur / Noir & blanc, Original par défaut', async () => {
        setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        const group = screen.getByRole('group', { name: 'Rendu' });
        const labels = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
        expect(labels).toEqual(['Original', 'Couleur', 'Noir & blanc']);
        const pressed = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
        expect([pressed(/^Original$/), pressed(/^Couleur$/), pressed(/Noir/)]).toEqual(['true', 'false', 'false']);
    });

    it("l'aperçu a exactement les proportions de l'image redressée (aucune bande autour)", async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 420;
        canvas.height = 594;
        mocks.warpAndEnhance.mockReturnValueOnce(canvas);
        setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));

        const preview = await screen.findByAltText('Document redressé');
        expect(Number(preview.style.getPropertyValue('--ratio'))).toBeCloseTo(420 / 594, 6);
    });

    it('« Original » redresse sans traitement de couleur (mode original)', async () => {
        setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        // Premier rendu : Original (défaut) ; on passe en Couleur puis on revient à Original
        expect(mocks.warpAndEnhance.mock.calls[0][3]).toBe('original');
        fireEvent.click(screen.getByRole('button', { name: /^Couleur$/ }));
        await waitFor(() => expect(mocks.warpAndEnhance).toHaveBeenCalledTimes(2));
        expect(mocks.warpAndEnhance.mock.calls[1][3]).toBe('color');
        await waitFor(() => expect(screen.getByRole('button', { name: /^Couleur$/ }).getAttribute('aria-pressed')).toBe('true'));

        fireEvent.click(screen.getByRole('button', { name: /^Original$/ }));
        await waitFor(() => expect(mocks.warpAndEnhance).toHaveBeenCalledTimes(3));
        expect(mocks.warpAndEnhance.mock.calls[2][3]).toBe('original');
        await waitFor(() => expect(screen.getByRole('button', { name: /^Original$/ }).getAttribute('aria-pressed')).toBe('true'));
        expect(screen.getByRole('button', { name: /^Couleur$/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('si le retraitement échoue, le choix précédent reste sélectionné', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        mocks.warpAndEnhance.mockImplementationOnce(() => { throw new Error('boom'); });
        fireEvent.click(screen.getByRole('button', { name: /Noir/ }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/redressement/i);
        expect(screen.getByRole('button', { name: /^Original$/ }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: /Noir/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('bascule en noir & blanc et retraite la page', async () => {
        setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        fireEvent.click(screen.getByRole('button', { name: /Noir & blanc/ }));
        await waitFor(() => expect(mocks.warpAndEnhance).toHaveBeenCalledTimes(2));
        expect(mocks.warpAndEnhance.mock.calls[1][3]).toBe('bw');
    });

    it('enchaîne plusieurs pages dans un seul PDF et permet de supprimer une vignette', async () => {
        const { onComplete } = setup();
        await waitLive();

        for (let i = 0; i < 2; i++) {
            fireEvent.click(await shutter());
            fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
            await screen.findByAltText('Document redressé');
            if (i === 0) {
                fireEvent.click(screen.getByRole('button', { name: /Ajouter une page/ }));
                await waitLive();
            }
        }
        expect(screen.getByAltText('Page 1')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Terminer/ }));
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
        expect(mocks.pagesToPdfFile.mock.calls[0][0]).toHaveLength(2);
    });

    it('capture automatiquement après ~1 s de stabilité', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        setup();
        await waitFor(() => expect(mocks.loadOpenCv).toHaveBeenCalled());
        await act(async () => { await Promise.resolve(); });
        await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
        await act(async () => { await Promise.resolve(); });

        await act(async () => { vi.advanceTimersByTime(600); });
        expect(screen.queryByText(/Ajustez les coins/)).toBeNull();
        await act(async () => { vi.advanceTimersByTime(1000); });
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
    });

    it("affiche un message clair si le PDF reste trop lourd", async () => {
        mocks.pagesToPdfFile.mockRejectedValue(new Error('Le document scanné est trop volumineux.'));
        const { onComplete } = setup();
        await waitLive();
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        fireEvent.click(screen.getByRole('button', { name: /Terminer/ }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/trop volumineux/);
        expect(onComplete).not.toHaveBeenCalled();
    });

    it("à la fermeture, le flux caméra est arrêté et rien n'est ajouté", async () => {
        const { onClose, onComplete, unmount } = setup();
        await waitLive();

        fireEvent.click(screen.getByRole('button', { name: 'Fermer le scanner' }));
        expect(onClose).toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();
        unmount();
        expect(stop).toHaveBeenCalled();
    });

    it('Échap ferme le scanner', async () => {
        const { onClose } = setup();
        await waitLive();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('le bouton retour (popstate) ferme le scanner', async () => {
        const { onClose } = setup();
        await waitLive();

        act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('supprime une vignette : seule la page restante part dans le PDF', async () => {
        const { onComplete } = setup();
        await waitLive();

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');
        fireEvent.click(screen.getByRole('button', { name: /Ajouter une page/ }));
        await waitLive();
        expect(screen.getByAltText('Page 1')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Supprimer la page 1' }));
        expect(screen.queryByAltText('Page 1')).toBeNull();

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');
        const keptCanvas = mocks.warpAndEnhance.mock.results[1].value;
        fireEvent.click(screen.getByRole('button', { name: /Terminer/ }));

        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
        expect(mocks.pagesToPdfFile.mock.calls[0][0]).toEqual([keptCanvas]);
    });

    it('caméra indisponible (pas de mediaDevices) : repli natif', async () => {
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
        const { onFallback } = setup();

        await screen.findByText(/scanner n’est pas disponible/i); // écran de repli (et non le bouton de la phase caméra)
        fireEvent.click(screen.getByRole('button', { name: /appareil photo du téléphone/i }));
        expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('caméra occupée (NotReadableError) : repli natif', async () => {
        getUserMedia.mockRejectedValue(new DOMException('busy', 'NotReadableError'));
        const { onFallback } = setup();

        await screen.findByText(/scanner n’est pas disponible/i);
        fireEvent.click(screen.getByRole('button', { name: /appareil photo du téléphone/i }));
        expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('arrête la caméra quand le moteur échoue', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.loadOpenCv.mockRejectedValue(new Error('wasm'));
        setup();
        await screen.findByText(/scanner n’est pas disponible/i);
        await waitFor(() => expect(stop).toHaveBeenCalled());
    });

    it("coins croisés : message d'erreur et aucun redressement", async () => {
        mocks.detectQuad.mockReturnValue([QUAD[0], QUAD[2], QUAD[1], QUAD[3]]);
        setup();
        await waitLive();
        await screen.findByText(/Document détecté/); // une détection a eu lieu : le contour croisé sera capturé

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/Les coins se croisent/);
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
        expect(mocks.warpAndEnhance).not.toHaveBeenCalled();
    });

    it('ne recapture pas la même page après « Ajouter une page », mais se réarme si le document est retiré', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        vi.stubGlobal('requestAnimationFrame', undefined); // le rAF de jsdom s'appuie sur setInterval (figé ici)
        const realWait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
        setup();
        await realWait(20);
        await realWait(20);

        await act(async () => { vi.advanceTimersByTime(1600); });
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await realWait(80);
        expect(screen.getByAltText('Document redressé')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Ajouter une page/ }));

        // Même document toujours devant la caméra : pas de nouvelle capture
        await act(async () => { vi.advanceTimersByTime(2500); });
        expect(screen.getByText(/Cadrez le document/)).toBeTruthy();

        // Document retiré puis représenté : la capture auto est de nouveau armée
        mocks.detectQuad.mockReturnValue(null);
        await act(async () => { vi.advanceTimersByTime(800); }); // ≥ 5 analyses ratées : le contour suivi est effacé
        mocks.detectQuad.mockReturnValue(QUAD);
        await act(async () => { vi.advanceTimersByTime(2000); });
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
    });

    it("relance la détection sur l'image figée en 1000 px et utilise ses coins", async () => {
        const refined = QUAD.map((p) => ({ x: p.x + 5, y: p.y + 5 }));
        setup();
        await waitLive();
        await screen.findByText(/Document détecté/);

        mocks.detectQuad.mockReturnValue(refined);
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        // Le contour en direct sert de référence pour retrouver le même document
        expect(mocks.detectQuad).toHaveBeenCalledWith(expect.anything(), expect.any(HTMLCanvasElement), 1000, expect.any(Array));
        expect(mocks.warpAndEnhance.mock.calls[0][2]).toEqual(refined);
    });

    it('si la détection sur image figée échoue, garde le contour en direct', async () => {
        setup();
        await waitLive();
        await screen.findByText(/Document détecté/);

        mocks.detectQuad.mockReturnValue(null);
        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        expect(mocks.warpAndEnhance.mock.calls[0][2]).toEqual(QUAD);
    });

    it("tolère une analyse ratée sans interrompre le compte à rebours de capture auto", async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        setup();
        await act(async () => { await new Promise((r) => setTimeout(r, 40)); });

        await act(async () => { vi.advanceTimersByTime(800); });
        mocks.detectQuad.mockReturnValueOnce(null);
        await act(async () => { vi.advanceTimersByTime(400); });

        // Sans tolérance, la capture n'arriverait qu'~1 s après l'analyse ratée
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
    });

    it("rejette la détection fine si elle s'écarte trop du contour en direct (autre rectangle)", async () => {
        const far = QUAD.map((p) => ({ x: p.x + 200, y: p.y }));
        mocks.detectQuad.mockImplementation((_cv: unknown, _source: unknown, size?: number) => (size === 1000 ? far : QUAD));
        setup();
        await waitLive();
        await screen.findByText(/Document détecté/);

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        expect(mocks.warpAndEnhance.mock.calls[0][2]).toEqual(QUAD);
    });

    it("sans contour en direct, adopte la détection fine plutôt que le cadre plein", async () => {
        mocks.detectQuad.mockImplementation((_cv: unknown, _source: unknown, size?: number) => (size === 1000 ? QUAD : null));
        setup();
        await waitLive();

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');

        expect(mocks.warpAndEnhance.mock.calls[0][2]).toEqual(QUAD);
        // Aucun contour en direct : pas de référence
        expect(mocks.detectQuad).toHaveBeenCalledWith(expect.anything(), expect.any(HTMLCanvasElement), 1000, null);
    });

    it("une analyse ratée ne fait pas avancer la stabilité : pas de capture sur un tick sans détection", async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        let liveCalls = 0;
        mocks.detectQuad.mockImplementation(() => {
            liveCalls += 1;
            return liveCalls === 9 ? null : QUAD; // le 9e tick (t = 1125 ms) est celui qui déclencherait la capture
        });
        setup();
        await act(async () => { await new Promise((r) => setTimeout(r, 40)); });

        await act(async () => { vi.advanceTimersByTime(1150); });
        expect(liveCalls).toBe(9);
        expect(screen.queryByText(/Ajustez les coins/)).toBeNull();

        await act(async () => { vi.advanceTimersByTime(200); }); // le tick suivant est une vraie détection
        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
    });

    it("propose l'appareil photo du téléphone en phase caméra ; le clic arrête les pistes puis appelle le repli", async () => {
        const { onFallback, onComplete } = setup();
        await waitLive();

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo du téléphone/ }));

        expect(stop).toHaveBeenCalled();
        expect(onFallback).toHaveBeenCalledTimes(1);
        // Ordre : flux arrêté AVANT le repli (iOS refuse l'appareil photo natif tant que la caméra est active)
        expect(stop.mock.invocationCallOrder[0]).toBeLessThan(onFallback.mock.invocationCallOrder[0]);
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('le bouton du téléphone disparaît dès qu\'une page est scannée (elle serait perdue) ; « Terminer » reste', async () => {
        setup();
        await waitLive();
        expect(screen.getByRole('button', { name: /Appareil photo du téléphone/ })).toBeTruthy();

        fireEvent.click(await shutter());
        fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
        await screen.findByAltText('Document redressé');
        fireEvent.click(screen.getByRole('button', { name: /Ajouter une page/ }));
        await waitLive();

        expect(screen.queryByRole('button', { name: /Appareil photo du téléphone/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Terminer/ })).toBeTruthy();
    });

    it("le bouton du téléphone n'est pas affiché pendant l'ajustement des coins", async () => {
        setup();
        await waitLive();
        fireEvent.click(await shutter());

        expect(screen.getByText(/Ajustez les coins/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Appareil photo du téléphone/ })).toBeNull();
    });

    it('arrête les pistes de la caméra au démontage', async () => {
        const { unmount } = render(<DocumentScanner onComplete={vi.fn()} onClose={vi.fn()} onFallback={vi.fn()} />);
        await waitFor(() => expect((screen.getByRole('button', { name: 'Prendre la photo' }) as HTMLButtonElement).disabled).toBe(false));
        unmount();
        expect(stop).toHaveBeenCalled();
    });
});
