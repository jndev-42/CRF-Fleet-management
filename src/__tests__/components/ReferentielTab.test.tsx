import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ReferentielTab from '@/components/admin/ReferentielTab';

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

/** XHR minimal : un PUT qui réussit après avoir signalé 100 % de progression. */
class FakeXhr {
    static instances: FakeXhr[] = [];
    static status = 200;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    status = 0;
    method = '';
    url = '';
    constructor() { FakeXhr.instances.push(this); }
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader() { /* sans objet */ }
    send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        this.status = FakeXhr.status;
        this.onload?.();
    }
}

const showToast = vi.fn();
let processCalls: { id: string; fromPage: number }[];

function mockFetch(opts: { status?: unknown; uploadResponse?: Response } = {}) {
    processCalls = [];
    vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/referentiel/upload') return opts.uploadResponse ?? json({ id: 'ref-1', uploadUrl: 'https://r2.test/put?sig=1' });
        if (url === '/api/referentiel/process') {
            const body = JSON.parse(String(init?.body));
            processCalls.push(body);
            return body.fromPage === 1
                ? json({ processedPages: 80, pageCount: 160, done: false })
                : json({ processedPages: 160, pageCount: 160, done: true });
        }
        return json(opts.status ?? { ready: false, pending: null });
    }) as typeof fetch);
}

beforeEach(() => {
    FakeXhr.instances = [];
    FakeXhr.status = 200;
    showToast.mockClear();
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function pickFile(file: File) {
    fireEvent.change(screen.getByLabelText('Fichier PDF du référentiel'), { target: { files: [file] } });
}

describe('ReferentielTab', () => {
    it('affiche « Aucun référentiel importé » au départ', async () => {
        mockFetch();
        render(<ReferentielTab showToast={showToast} />);
        expect(await screen.findByText('Aucun référentiel importé')).toBeTruthy();
    });

    it('affiche le référentiel actif', async () => {
        mockFetch({ status: { ready: true, fileName: 'guide.pdf', pageCount: 826, readyAt: '2026-10-01 10:00:00' } });
        render(<ReferentielTab showToast={showToast} />);
        expect(await screen.findByText('guide.pdf')).toBeTruthy();
        expect(screen.getByText(/826 pages indexées/)).toBeTruthy();
    });

    it('refuse un fichier qui n\'est pas un PDF sans rien envoyer', async () => {
        mockFetch();
        render(<ReferentielTab showToast={showToast} />);
        await screen.findByText('Aucun référentiel importé');
        pickFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
        expect(showToast).toHaveBeenCalledWith('Le fichier doit être un PDF.', 'error');
        expect(FakeXhr.instances).toHaveLength(0);
    });

    it('envoie directement à R2 puis boucle sur process jusqu\'à la fin', async () => {
        mockFetch();
        render(<ReferentielTab showToast={showToast} />);
        await screen.findByText('Aucun référentiel importé');
        pickFile(new File(['%PDF-'], 'guide.pdf', { type: 'application/pdf' }));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Référentiel importé et indexé.', 'success'));
        expect(FakeXhr.instances[0]).toMatchObject({ method: 'PUT', url: 'https://r2.test/put?sig=1' });
        expect(processCalls).toEqual([{ id: 'ref-1', fromPage: 1 }, { id: 'ref-1', fromPage: 81 }]);
    });

    it('signale un envoi refusé par R2 et ne lance pas l\'indexation', async () => {
        FakeXhr.status = 403;
        mockFetch();
        render(<ReferentielTab showToast={showToast} />);
        await screen.findByText('Aucun référentiel importé');
        pickFile(new File(['%PDF-'], 'guide.pdf', { type: 'application/pdf' }));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Envoi refusé (HTTP 403)', 'error'));
        expect(processCalls).toHaveLength(0);
    });

    it('affiche l\'erreur du serveur à la création de l\'import', async () => {
        mockFetch({ uploadResponse: json({ error: 'Interdit' }, 403) });
        render(<ReferentielTab showToast={showToast} />);
        await screen.findByText('Aucun référentiel importé');
        pickFile(new File(['%PDF-'], 'guide.pdf', { type: 'application/pdf' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Interdit', 'error'));
        expect(FakeXhr.instances).toHaveLength(0);
    });
});
