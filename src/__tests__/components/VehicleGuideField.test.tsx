import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import VehicleGuideField, { applyGuideChange, GuideChange } from '@/components/vehicle/VehicleGuideField';

const LABEL = 'Guide de vérification (PDF, 4 Mo max) — Optionnel';

function pdf(name = 'VPSP 182.pdf', size = 1024) {
    return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

/** Champ contrôlé, comme dans les modales. */
function Harness({ currentFileName = null, onChange }: { currentFileName?: string | null; onChange?: (c: GuideChange) => void }) {
    const [value, setValue] = useState<GuideChange>({ kind: 'keep' });
    return (
        <VehicleGuideField
            currentFileName={currentFileName}
            value={value}
            onChange={(c) => { setValue(c); onChange?.(c); }}
        />
    );
}

function selectFile(file: File) {
    fireEvent.change(screen.getByLabelText(LABEL), { target: { files: [file] } });
}

describe('VehicleGuideField', () => {
    it('indique l\'absence de guide et propose d\'en joindre un', () => {
        render(<Harness />);
        expect(screen.getByTestId('guide-status').textContent).toContain('Aucun guide joint');
        expect(screen.getByRole('button', { name: /Joindre un PDF/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull();
    });

    it('affiche le guide actuel avec Remplacer et Retirer', () => {
        render(<Harness currentFileName="VPSP 182.pdf" />);
        expect(screen.getByTestId('guide-status').textContent).toContain('VPSP 182.pdf');
        expect(screen.getByRole('button', { name: /Remplacer/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Retirer/ })).toBeTruthy();
    });

    it('accepte un PDF valide et le signale comme à enregistrer', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const file = pdf();
        selectFile(file);
        expect(onChange).toHaveBeenCalledWith({ kind: 'replace', file });
        expect(screen.getByTestId('guide-status').textContent).toContain('sera enregistré');
    });

    it('refuse un fichier qui n\'est pas un PDF', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        selectFile(new File(['x'], 'photo.png', { type: 'image/png' }));
        expect(screen.getByRole('alert').textContent).toBe('Le fichier doit être un PDF.');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('refuse un PDF de plus de 4 Mo', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        selectFile(pdf('gros.pdf', 5 * 1024 * 1024));
        expect(screen.getByRole('alert').textContent).toContain('4 Mo maximum');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('Retirer puis Annuler revient au guide actuel', () => {
        const onChange = vi.fn();
        render(<Harness currentFileName="VPSP 182.pdf" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
        expect(onChange).toHaveBeenLastCalledWith({ kind: 'remove' });
        expect(screen.getByTestId('guide-status').textContent).toContain('sera retiré');

        fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
        expect(onChange).toHaveBeenLastCalledWith({ kind: 'keep' });
    });
});

describe('applyGuideChange', () => {
    beforeEach(() => { vi.restoreAllMocks(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('ne fait aucun appel sans changement', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        expect(await applyGuideChange('VL1', { kind: 'keep' })).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('envoie le fichier en multipart sur la route du guide', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        const file = pdf();
        expect(await applyGuideChange('VPSP 182', { kind: 'replace', file })).toBeNull();
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('/api/vehicles/VPSP%20182/guide');
        expect(init?.method).toBe('POST');
        expect((init?.body as FormData).get('file')).toBeTruthy();
    });

    it('retire le guide via DELETE', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        expect(await applyGuideChange('VL1', { kind: 'remove' })).toBeNull();
        expect(fetchSpy.mock.calls[0][1]?.method).toBe('DELETE');
    });

    it('renvoie le message du serveur en cas de refus', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Le fichier doit être un PDF.' }), { status: 400 }));
        expect(await applyGuideChange('VL1', { kind: 'replace', file: pdf() })).toBe('Le fichier doit être un PDF.');
    });

    it('traduit un 413 sans corps JSON (refus de la plateforme)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Request Entity Too Large', { status: 413 }));
        expect(await applyGuideChange('VL1', { kind: 'replace', file: pdf() })).toContain('4 Mo maximum');
    });

    it('signale une erreur de connexion', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        await waitFor(async () => expect(await applyGuideChange('VL1', { kind: 'remove' })).toBe('Erreur de connexion'));
    });
});
