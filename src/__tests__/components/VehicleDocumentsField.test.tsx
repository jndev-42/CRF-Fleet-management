import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import VehicleDocumentsField, {
    applyDocumentChanges,
    DocumentChanges,
    NO_DOCUMENT_CHANGES,
} from '@/components/vehicle/VehicleDocumentsField';
import type { VehicleDocumentMeta } from '@/lib/vehicleDocuments/types';

const LABEL = 'Documents liés au véhicule (PDF, 4 Mo max chacun) — Optionnel';

const EXISTING: VehicleDocumentMeta[] = [
    { id: 'd1', fileName: 'VPSP 182.pdf', size: 2048, createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'd2', fileName: 'Carte grise.pdf', size: 4096, createdAt: '2026-10-02T10:00:00.000Z' },
];

const REMOVE_BOTH = [
    { id: 'd1', fileName: 'VPSP 182.pdf' },
    { id: 'd2', fileName: 'Carte grise.pdf' },
];

function pdf(name = 'VPSP 182.pdf', size = 1024) {
    return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

/** Champ contrôlé, comme dans les modales. */
function Harness({ documents = [], onChange }: { documents?: VehicleDocumentMeta[]; onChange?: (c: DocumentChanges) => void }) {
    const [value, setValue] = useState<DocumentChanges>(NO_DOCUMENT_CHANGES);
    return (
        <VehicleDocumentsField
            documents={documents}
            value={value}
            onChange={(c) => { setValue(c); onChange?.(c); }}
        />
    );
}

function selectFiles(files: File[]) {
    fireEvent.change(screen.getByLabelText(LABEL), { target: { files } });
}

describe('VehicleDocumentsField', () => {
    it("indique l'absence de document et propose d'en joindre", () => {
        render(<Harness />);
        expect(screen.getByTestId('documents-status').textContent).toContain('Aucun document joint');
        expect(screen.getByRole('button', { name: /Joindre des PDF/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull();
    });

    it('accepte la sélection multiple', () => {
        render(<Harness />);
        expect((screen.getByLabelText(LABEL) as HTMLInputElement).multiple).toBe(true);
    });

    it('liste les documents actuels, chacun avec son bouton Retirer', () => {
        render(<Harness documents={EXISTING} />);
        const status = screen.getByTestId('documents-status').textContent;
        expect(status).toContain('VPSP 182.pdf');
        expect(status).toContain('Carte grise.pdf');
        expect(screen.getByRole('button', { name: 'Retirer VPSP 182.pdf' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retirer Carte grise.pdf' })).toBeTruthy();
    });

    it('ajoute plusieurs PDF valides en une sélection', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const a = pdf('a.pdf');
        const b = pdf('b.pdf');
        selectFiles([a, b]);
        expect(onChange).toHaveBeenLastCalledWith({ add: [a, b], remove: [] });
        expect(screen.getByTestId('documents-status').textContent).toContain('sera enregistré');
    });

    it('les sélections successives s\'additionnent', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const a = pdf('a.pdf');
        const b = pdf('b.pdf');
        selectFiles([a]);
        selectFiles([b]);
        expect(onChange).toHaveBeenLastCalledWith({ add: [a, b], remove: [] });
    });

    it('refuse un fichier non PDF en nommant le fichier, et garde les PDF valides', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const ok = pdf('ok.pdf');
        selectFiles([new File(['x'], 'photo.png', { type: 'image/png' }), ok]);
        expect(screen.getByRole('alert').textContent).toBe('photo.png : Le fichier doit être un PDF.');
        expect(onChange).toHaveBeenLastCalledWith({ add: [ok], remove: [] });
    });

    it('refuse un PDF de plus de 4 Mo', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        selectFiles([pdf('gros.pdf', 5 * 1024 * 1024)]);
        expect(screen.getByRole('alert').textContent).toContain('gros.pdf : Le fichier est trop volumineux (4 Mo maximum).');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('Annuler retire un fichier en attente', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const a = pdf('a.pdf');
        const b = pdf('b.pdf');
        selectFiles([a, b]);
        fireEvent.click(screen.getByRole('button', { name: 'Ne pas ajouter a.pdf' }));
        expect(onChange).toHaveBeenLastCalledWith({ add: [b], remove: [] });
    });

    it('Retirer puis Annuler le retrait revient au document actuel', () => {
        const onChange = vi.fn();
        render(<Harness documents={EXISTING} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Retirer VPSP 182.pdf' }));
        expect(onChange).toHaveBeenLastCalledWith({ add: [], remove: [{ id: 'd1', fileName: 'VPSP 182.pdf' }] });
        expect(screen.getByTestId('documents-status').textContent).toContain('sera retiré');

        fireEvent.click(screen.getByRole('button', { name: 'Annuler le retrait de VPSP 182.pdf' }));
        expect(onChange).toHaveBeenLastCalledWith({ add: [], remove: [] });
    });
});

describe('applyDocumentChanges', () => {
    beforeEach(() => { vi.restoreAllMocks(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('ne fait aucun appel sans changement', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await applyDocumentChanges('VL1', NO_DOCUMENT_CHANGES)).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('envoie un POST multipart par fichier, sur la route des documents', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
        expect(await applyDocumentChanges('VPSP 182', { add: [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')], remove: [] })).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        for (const [url, init] of fetchSpy.mock.calls) {
            expect(url).toBe('/api/vehicles/VPSP%20182/documents');
            expect(init?.method).toBe('POST');
            expect((init?.body as FormData).get('file')).toBeTruthy();
        }
    });

    it('retire chaque document par son identifiant via DELETE', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        expect(await applyDocumentChanges('VL1', { add: [], remove: REMOVE_BOTH })).toBeNull();
        expect(fetchSpy.mock.calls.map(c => [c[0], c[1]?.method])).toEqual([
            ['/api/vehicles/VL1/documents/d1', 'DELETE'],
            ['/api/vehicles/VL1/documents/d2', 'DELETE'],
        ]);
    });

    it('exécute les ajouts AVANT les retraits (un remplacement qui échoue ne perd rien)', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        await applyDocumentChanges('VL1', { add: [pdf('nouvelle.pdf')], remove: [REMOVE_BOTH[0]] });
        expect(fetchSpy.mock.calls.map(c => c[1]?.method)).toEqual(['POST', 'DELETE']);
    });

    it('un retrait refusé est nommé avec le message du serveur', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Document non trouvé' }), { status: 404 }));
        expect(await applyDocumentChanges('VL1', { add: [], remove: [REMOVE_BOTH[0]] }))
            .toBe('VPSP 182.pdf : Retrait impossible : Document non trouvé');
    });

    it('un retrait sans corps JSON signale le code HTTP', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
        expect(await applyDocumentChanges('VL1', { add: [], remove: [REMOVE_BOTH[0]] }))
            .toBe('VPSP 182.pdf : Retrait impossible : Erreur HTTP 500');
    });

    it('un retrait rejeté (réseau) est nommé', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await applyDocumentChanges('VL1', { add: [], remove: [REMOVE_BOTH[1]] }))
            .toBe('Carte grise.pdf : Retrait impossible : erreur de connexion');
    });

    it('un retrait échoué ne bloque ni les autres retraits ni les ajouts', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) =>
            String(url).endsWith('/d1')
                ? new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 })
                : new Response('{}', { status: 200 }));
        const message = await applyDocumentChanges('VL1', { add: [pdf('a.pdf')], remove: REMOVE_BOTH });
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(message).toBe('VPSP 182.pdf : Retrait impossible : Interdit');
    });

    it('plusieurs échecs sont tous nommés, un par ligne', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
            if (init?.method === 'DELETE') return new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 });
            const file = (init?.body as FormData).get('file') as File;
            return file.name === 'ok.pdf'
                ? new Response('{}', { status: 201 })
                : new Response(JSON.stringify({ error: 'Le fichier doit être un PDF.' }), { status: 400 });
        });
        const message = await applyDocumentChanges('VL1', {
            add: [pdf('faux1.pdf'), pdf('ok.pdf'), pdf('faux2.pdf')],
            remove: [REMOVE_BOTH[0]],
        });
        expect(message).toBe([
            'faux1.pdf : Le fichier doit être un PDF.',
            'faux2.pdf : Le fichier doit être un PDF.',
            'VPSP 182.pdf : Retrait impossible : Interdit',
        ].join('\n'));
    });

    it('un fichier refusé n\'empêche pas les autres, et le message le nomme', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
            const file = (init?.body as FormData).get('file') as File;
            return file.name === 'faux.pdf'
                ? new Response(JSON.stringify({ error: 'Le fichier doit être un PDF.' }), { status: 400 })
                : new Response('{}', { status: 201 });
        });
        const message = await applyDocumentChanges('VL1', { add: [pdf('a.pdf'), pdf('faux.pdf'), pdf('c.pdf')], remove: [] });
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(message).toBe('faux.pdf : Le fichier doit être un PDF.');
    });

    it('traduit un 413 sans corps JSON (refus de la plateforme)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Request Entity Too Large', { status: 413 }));
        expect(await applyDocumentChanges('VL1', { add: [pdf('gros.pdf')], remove: [] })).toBe('gros.pdf : Le fichier est trop volumineux (4 Mo maximum).');
    });

    it('signale une erreur de connexion en nommant le fichier', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await applyDocumentChanges('VL1', { add: [pdf('a.pdf')], remove: [] })).toBe('a.pdf : erreur de connexion');
    });
});
