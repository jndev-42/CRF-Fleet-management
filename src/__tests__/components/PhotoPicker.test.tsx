import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotoPicker from '@/components/ui/PhotoPicker';

// jsdom ne déclenche jamais onload/onerror sur un <img> chargé depuis un blob: URL,
// ce qui bloquerait indéfiniment la Promise de compression réelle (voir imageCompression.ts).
// On mocke le module pour isoler la logique de validation de taille de PhotoPicker,
// qui est ce que ces tests vérifient réellement.
vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
}));

vi.mock('@/components/ui/DocumentScanner', () => ({
    default: ({ onComplete, onClose, onFallback }: { onComplete: (f: File) => void; onClose: () => void; onFallback: () => void }) => (
        <div role="dialog" aria-label="Scanner de document">
            <button onClick={() => onComplete(new File(['pdf'], 'compte-rendu-scan.pdf', { type: 'application/pdf' }))}>mock-complete</button>
            <button onClick={onClose}>mock-close</button>
            <button onClick={onFallback}>mock-fallback</button>
        </div>
    ),
}));

describe('PhotoPicker — validation des tailles et limites', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('affiche la taille totale courante si des photos sont présentes', () => {
        const file1 = new File(['a'.repeat(2 * 1024 * 1024)], 'photo1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['b'.repeat(3 * 1024 * 1024)], 'photo2.jpg', { type: 'image/jpeg' });

        render(<PhotoPicker label="Photos test" photos={[file1, file2]} onPhotosChange={vi.fn()} />);

        expect(screen.getByText(/Taille totale : 5\.0 Mo \/ 150 Mo/i)).toBeTruthy();
    });

    it('refuse un fichier individuel qui dépasse 15 Mo', async () => {
        const onPhotosChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                photos={[]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={15}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        expect(input).toBeTruthy();

        // 16 MB file
        const bigFile = new File(['x'.repeat(16 * 1024 * 1024)], 'trop_gros.jpg', { type: 'image/jpeg' });

        fireEvent.change(input, { target: { files: [bigFile] } });

        expect(await screen.findByText(/dépasse 15 Mo/i)).toBeTruthy();
        expect(onPhotosChange).not.toHaveBeenCalled();
    });

    it('refuse d\'ajouter des fichiers si la taille totale dépasse 150 Mo', async () => {
        const onPhotosChange = vi.fn();

        // Simulate 145 MB already selected
        const existing145MB = new File(['x'.repeat(1024)], 'existing.jpg', { type: 'image/jpeg' });
        Object.defineProperty(existing145MB, 'size', { value: 145 * 1024 * 1024 });

        const { container } = render(
            <PhotoPicker
                photos={[existing145MB]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={15}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;

        // New 8 MB file (145 + 8 = 153 MB > 150 MB)
        const new8MBFile = new File(['y'.repeat(1024)], 'new.jpg', { type: 'image/jpeg' });
        Object.defineProperty(new8MBFile, 'size', { value: 8 * 1024 * 1024 });

        fireEvent.change(input, { target: { files: [new8MBFile] } });

        expect(await screen.findByText(/dépasse la limite totale de 150 Mo/i)).toBeTruthy();
        expect(onPhotosChange).not.toHaveBeenCalled();
    });

    it('accepte les fichiers valides en dessous des limites sans restreindre le nombre de fichiers', async () => {
        const onPhotosChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                photos={[]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={15}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;

        // Create 20 small files of 1MB each
        const files: File[] = [];
        for (let i = 0; i < 20; i++) {
            files.push(new File(['a'.repeat(1024 * 1024)], `valid_${i}.jpg`, { type: 'image/jpeg' }));
        }

        fireEvent.change(input, { target: { files } });

        await vi.waitFor(() => expect(onPhotosChange).toHaveBeenCalledWith(files));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('en mode single file, refuse un fichier de plus de 15 Mo', async () => {
        const onFileChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                file={null}
                onFileChange={onFileChange}
                maxSizeMB={15}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"]:not([multiple])') as HTMLInputElement;
        const bigFile = new File(['x'.repeat(16 * 1024 * 1024)], 'big_pdf.pdf', { type: 'application/pdf' });

        fireEvent.change(input, { target: { files: [bigFile] } });

        expect(await screen.findByText(/dépasse la limite de 15 Mo/i)).toBeTruthy();
        expect(onFileChange).not.toHaveBeenCalled();
    });
});

describe('PhotoPicker — scanner de document', () => {
    it("ouvre le scanner depuis « Appareil photo » quand scanDocument est actif", async () => {
        render(<PhotoPicker file={null} onFileChange={vi.fn()} scanDocument />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        expect(await screen.findByRole('dialog', { name: 'Scanner de document' })).toBeTruthy();
    });

    it("garde l'appareil photo natif sans scanDocument", () => {
        const { container } = render(<PhotoPicker file={null} onFileChange={vi.fn()} />);
        const cameraInput = container.querySelector('input[capture]') as HTMLInputElement;
        const click = vi.spyOn(cameraInput, 'click');

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));

        expect(click).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('passe le PDF scanné par le circuit habituel et ferme le scanner', async () => {
        const onFileChange = vi.fn();
        render(<PhotoPicker file={null} onFileChange={onFileChange} scanDocument />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-complete'));

        await waitFor(() => expect(onFileChange).toHaveBeenCalledTimes(1));
        expect((onFileChange.mock.calls[0][0] as File).name).toBe('compte-rendu-scan.pdf');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("refuse le PDF scanné s'il dépasse la limite par fichier", async () => {
        const onFileChange = vi.fn();
        render(<PhotoPicker file={null} onFileChange={onFileChange} scanDocument maxSizeMB={0.000001} />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-complete'));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(onFileChange).not.toHaveBeenCalled();
    });

    it("ferme le scanner sans rien ajouter", async () => {
        const onFileChange = vi.fn();
        render(<PhotoPicker file={null} onFileChange={onFileChange} scanDocument />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-close'));

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onFileChange).not.toHaveBeenCalled();
    });

    it("le repli ouvre l'input natif `capture`", async () => {
        const { container } = render(<PhotoPicker file={null} onFileChange={vi.fn()} scanDocument />);
        const cameraInput = container.querySelector('input[capture]') as HTMLInputElement;
        const click = vi.spyOn(cameraInput, 'click');

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-fallback'));

        expect(click).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
