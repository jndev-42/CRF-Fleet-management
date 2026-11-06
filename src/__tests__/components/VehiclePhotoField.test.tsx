import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { useState } from 'react';
import VehiclePhotoField, { applyPhotoChange, PhotoChange } from '@/components/vehicle/VehiclePhotoField';

const CURRENT = '/api/vehicles/VL1/photo?v=1';

function photo(name = 'photo.jpg') {
    return new File([new Uint8Array(1024)], name, { type: 'image/jpeg' });
}

/** Champ contrôlé, comme dans les modales. */
function Harness({ currentSrc = null, disabled, onChange }: { currentSrc?: string | null; disabled?: boolean; onChange?: (c: PhotoChange) => void }) {
    const [value, setValue] = useState<PhotoChange>({ kind: 'keep' });
    return (
        <VehiclePhotoField
            currentSrc={currentSrc}
            value={value}
            disabled={disabled}
            onChange={(c) => { setValue(c); onChange?.(c); }}
        />
    );
}

function selectFile(container: HTMLElement, file: File) {
    const gallery = container.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    fireEvent.change(gallery, { target: { files: [file] } });
}

beforeAll(() => {
    // jsdom n'implémente pas createObjectURL, utilisé par l'aperçu de PhotoPicker.
    URL.createObjectURL = vi.fn(() => 'blob:apercu');
});

describe('VehiclePhotoField', () => {
    it("indique l'absence de photo, sans Retirer ni Annuler", () => {
        render(<Harness />);
        expect((screen.getByTestId('photo-status')).textContent).toContain('Aucune photo.');
        expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Annuler/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Appareil photo/ })).toBeTruthy();
    });

    it('montre la photo actuelle et limite la galerie aux formats acceptés', () => {
        const { container } = render(<Harness currentSrc={CURRENT} />);
        expect(screen.getByAltText('Photo actuelle du véhicule')?.getAttribute('src')).toBe(CURRENT);
        expect(container.querySelector('input[type="file"]:not([capture])')?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    });

    it('Retirer demande le retrait, Annuler revient à la photo actuelle', () => {
        const onChange = vi.fn();
        render(<Harness currentSrc={CURRENT} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
        expect(onChange).toHaveBeenLastCalledWith({ kind: 'remove' });
        expect((screen.getByTestId('photo-status')).textContent).toContain('La photo actuelle sera retirée.');

        fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
        expect(onChange).toHaveBeenLastCalledWith({ kind: 'keep' });
        expect(screen.getByAltText('Photo actuelle du véhicule')).toBeTruthy();
    });

    it('choisir un fichier demande le remplacement, Annuler y renonce', async () => {
        const onChange = vi.fn();
        const file = photo();
        const { container } = render(<Harness currentSrc={CURRENT} onChange={onChange} />);
        selectFile(container, file);
        await waitFor(() => expect(onChange).toHaveBeenCalledWith({ kind: 'replace', file }));
        expect(screen.getByAltText('Aperçu')).toBeTruthy();
        expect(screen.queryByAltText('Photo actuelle du véhicule')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
        expect(onChange).toHaveBeenLastCalledWith({ kind: 'keep' });
        expect(screen.queryByAltText('Aperçu')).toBeNull();
    });

    it('refuse un fichier de plus de 4 Mo après compression', async () => {
        const onChange = vi.fn();
        const big = new File([new Uint8Array(1024)], 'scan.pdf', { type: 'application/pdf' });
        Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 });
        const { container } = render(<Harness onChange={onChange} />);
        selectFile(container, big);
        expect((await screen.findByRole('alert')).textContent).toContain('dépasse la limite de 4 Mo');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('masque une photo actuelle illisible mais laisse la retirer', () => {
        render(<Harness currentSrc={CURRENT} />);
        fireEvent.error(screen.getByAltText('Photo actuelle du véhicule'));
        expect(screen.queryByAltText('Photo actuelle du véhicule')).toBeNull();
        expect(screen.getByTestId('photo-status').textContent).toBe('Photo actuelle illisible.');
        expect(screen.getByRole('button', { name: /Retirer/ })).toBeTruthy();
    });

    it('désactive ses boutons pendant un envoi', () => {
        render(<Harness currentSrc={CURRENT} disabled />);
        expect(screen.getByRole('button', { name: /Retirer/ }).matches(':disabled')).toBe(true);
        expect(screen.getByRole('button', { name: /Appareil photo/ }).matches(':disabled')).toBe(true);
    });
});

describe('applyPhotoChange', () => {
    afterEach(() => vi.restoreAllMocks());

    function mockFetch(response: Response | Error) {
        const mock = vi.fn().mockImplementation(async () => {
            if (response instanceof Error) throw response;
            return response;
        });
        vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
        return mock;
    }

    it("n'appelle rien sans changement", async () => {
        const fetchMock = mockFetch(new Response('{}'));
        expect(await applyPhotoChange('VL1', { kind: 'keep' })).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envoie le fichier en multipart, sous le nom encodé', async () => {
        const fetchMock = mockFetch(new Response('{}'));
        const file = photo();
        expect(await applyPhotoChange('VPSP 182', { kind: 'replace', file })).toBeNull();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/vehicles/VPSP%20182/photo');
        expect(init.method).toBe('POST');
        expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    });

    it('retire par DELETE', async () => {
        const fetchMock = mockFetch(new Response('{}'));
        expect(await applyPhotoChange('VL1', { kind: 'remove' })).toBeNull();
        expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    });

    it('remonte le message du serveur', async () => {
        mockFetch(new Response(JSON.stringify({ error: 'La photo doit être au format JPEG, PNG ou WebP.' }), { status: 400 }));
        expect(await applyPhotoChange('VL1', { kind: 'replace', file: photo() }))
            .toBe('La photo doit être au format JPEG, PNG ou WebP.');
    });

    it('traduit un 413 de la plateforme, sans JSON', async () => {
        mockFetch(new Response('Request Entity Too Large', { status: 413 }));
        expect(await applyPhotoChange('VL1', { kind: 'replace', file: photo() }))
            .toBe('La photo est trop volumineuse (4 Mo maximum).');
    });

    it('signale une erreur réseau', async () => {
        mockFetch(new Error('offline'));
        expect(await applyPhotoChange('VL1', { kind: 'remove' })).toBe('Erreur de connexion');
    });
});
