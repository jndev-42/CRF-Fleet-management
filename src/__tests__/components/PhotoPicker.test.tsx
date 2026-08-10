import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoPicker from '@/components/ui/PhotoPicker';

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

    it('refuse un fichier individuel qui dépasse 10 Mo', () => {
        const onPhotosChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                photos={[]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={10}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        expect(input).toBeTruthy();

        // 11 MB file
        const bigFile = new File(['x'.repeat(11 * 1024 * 1024)], 'trop_gros.jpg', { type: 'image/jpeg' });

        fireEvent.change(input, { target: { files: [bigFile] } });

        expect(onPhotosChange).not.toHaveBeenCalled();
        expect(screen.getByText(/dépasse 10 Mo/i)).toBeTruthy();
    });

    it('refuse d\'ajouter des fichiers si la taille totale dépasse 150 Mo', () => {
        const onPhotosChange = vi.fn();

        // Simulate 145 MB already selected
        const existing145MB = new File(['x'.repeat(1024)], 'existing.jpg', { type: 'image/jpeg' });
        Object.defineProperty(existing145MB, 'size', { value: 145 * 1024 * 1024 });

        const { container } = render(
            <PhotoPicker
                photos={[existing145MB]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={10}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;

        // New 8 MB file (145 + 8 = 153 MB > 150 MB)
        const new8MBFile = new File(['y'.repeat(1024)], 'new.jpg', { type: 'image/jpeg' });
        Object.defineProperty(new8MBFile, 'size', { value: 8 * 1024 * 1024 });

        fireEvent.change(input, { target: { files: [new8MBFile] } });

        expect(onPhotosChange).not.toHaveBeenCalled();
        expect(screen.getByText(/dépasse la limite totale de 150 Mo/i)).toBeTruthy();
    });

    it('accepte les fichiers valides en dessous des limites sans restreindre le nombre de fichiers', () => {
        const onPhotosChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                photos={[]}
                onPhotosChange={onPhotosChange}
                maxSizeMB={10}
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

        expect(onPhotosChange).toHaveBeenCalledWith(files);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('en mode single file, refuse un fichier de plus de 10 Mo', () => {
        const onFileChange = vi.fn();
        const { container } = render(
            <PhotoPicker
                file={null}
                onFileChange={onFileChange}
                maxSizeMB={10}
                maxTotalSizeMB={150}
            />
        );

        const input = container.querySelector('input[type="file"]:not([multiple])') as HTMLInputElement;
        const bigFile = new File(['x'.repeat(12 * 1024 * 1024)], 'big_pdf.pdf', { type: 'application/pdf' });

        fireEvent.change(input, { target: { files: [bigFile] } });

        expect(onFileChange).not.toHaveBeenCalled();
        expect(screen.getByText(/dépasse la limite de 10 Mo/i)).toBeTruthy();
    });
});
