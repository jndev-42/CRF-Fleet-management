import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useObjectUrl } from '@/components/ui/useObjectUrl';

const image = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

function Preview({ file }: { file: File | null }) {
    const ref = useObjectUrl(file);
    // eslint-disable-next-line @next/next/no-img-element -- élément de test, URL blob:
    return <img ref={ref} alt="Aperçu" />;
}

describe('useObjectUrl', () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    let created: number;

    const src = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src');

    beforeEach(() => {
        created = 0;
        URL.createObjectURL = vi.fn(() => `blob:url-${++created}`);
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
    });

    it("écrit l'URL sur l'image", () => {
        const { container } = render(<Preview file={image()} />);
        expect(src(container)).toBe('blob:url-1');
    });

    it('ne crée aucune URL sans fichier', () => {
        const { container } = render(<Preview file={null} />);
        expect(src(container)).toBeFalsy();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it.each([
        ['HTML', 'text/html'],
        ['XML', 'text/xml'],
        ['PDF', 'application/pdf'],
        ['type vide', ''],
    ])("ne crée aucune URL pour un fichier qui n'est pas une image (%s)", (_label, type) => {
        const { container } = render(<Preview file={new File(['x'], 'f.jpg', { type })} />);
        expect(src(container)).toBeFalsy();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('une seule URL par fichier, quel que soit le nombre de rendus', () => {
        const file = image();
        const { rerender } = render(<Preview file={file} />);
        rerender(<Preview file={file} />);
        rerender(<Preview file={file} />);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it("révoque l'ancienne URL quand le fichier change", () => {
        const { container, rerender } = render(<Preview file={image('a.jpg')} />);
        rerender(<Preview file={image('b.jpg')} />);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
        expect(src(container)).toBe('blob:url-2');
    });

    it('révoque quand le fichier est retiré', () => {
        const { rerender } = render(<Preview file={image()} />);
        rerender(<Preview file={null} />);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
    });

    it('révoque au démontage', () => {
        const { unmount } = render(<Preview file={image()} />);
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
    });
});
