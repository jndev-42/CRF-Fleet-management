import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ImportCsvModal from '@/components/inventory/modals/ImportCsvModal';

function makeFile(content = 'nom;categorie;quantite;date_peremption;stock_min;notes\nGarrot;;1;;;\n') {
    return new File([content], 'stock.csv', { type: 'text/csv' });
}

describe('ImportCsvModal', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('ne rend rien si isOpen est false', () => {
        const { container } = render(<ImportCsvModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche une erreur si le nom est vide, sans appeler fetch', () => {
        const { container } = render(<ImportCsvModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        // `fireEvent.submit` sur le <form> déclenche directement le handler React :
        // un clic sur le bouton passerait par la validation HTML5 native de jsdom
        // (attribut `required`), qui bloquerait la soumission avant même d'atteindre
        // `handleSubmit` — ce n'est pas ce que ce test veut exercer.
        fireEvent.submit(container.querySelector('form')!);

        expect(screen.getByText('Le nom du stock est requis')).toBeTruthy();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('affiche une erreur si aucun fichier n\'est sélectionné, sans appeler fetch', () => {
        const { container } = render(<ImportCsvModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/ex: Stock Véhicules/), { target: { value: 'Stock Import' } });
        fireEvent.submit(container.querySelector('form')!);

        expect(screen.getByText('Sélectionnez un fichier CSV')).toBeTruthy();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('affiche error et lineErrors sur une réponse non-ok', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({
                error: 'Le fichier CSV contient des lignes invalides. Corrigez-les puis relancez l\'import.',
                lines: [{ line: 3, column: 'nom', reason: 'Le nom de l\'article est obligatoire' }],
            }),
        } as Response);

        const { container } = render(<ImportCsvModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/ex: Stock Véhicules/), { target: { value: 'Stock Import' } });
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [makeFile()] } });
        fireEvent.submit(container.querySelector('form')!);

        expect(await screen.findByText('Le fichier CSV contient des lignes invalides. Corrigez-les puis relancez l\'import.')).toBeTruthy();
        expect(screen.getByText('Ligne 3')).toBeTruthy();
        expect(screen.getByText('Le nom de l\'article est obligatoire', { exact: false })).toBeTruthy();
    });

    it('appelle onSuccess avec stockId/itemCount puis onClose sur une réponse 201', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ stockId: 'stock-1', itemCount: 3, extra: 'ignored' }),
        } as Response);

        const onSuccess = vi.fn();
        const onClose = vi.fn();
        const { container } = render(<ImportCsvModal isOpen onClose={onClose} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText(/ex: Stock Véhicules/), { target: { value: 'Stock Import' } });
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [makeFile()] } });
        fireEvent.submit(container.querySelector('form')!);

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ stockId: 'stock-1', itemCount: 3 }));
        expect(onClose).toHaveBeenCalled();
    });
});
