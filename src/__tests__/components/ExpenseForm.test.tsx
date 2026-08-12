import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(() => ({ data: { user: { name: 'Jean Dupont', email: 'jean@test.com' } }, status: 'authenticated' })),
}));

vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
}));

vi.mock('@/components/expenses/YousignSignatureModal', () => ({
    default: ({ isOpen, onSign }: { isOpen: boolean; onSign: (sig: unknown, func: string) => void }) =>
        isOpen ? (
            <div>
                <span>Modale de signature Yousign</span>
                <button onClick={() => onSign({ signed: true }, 'Bénévole local')}>Confirmer la signature</button>
            </div>
        ) : null,
}));

import ExpenseForm from '@/components/expenses/ExpenseForm';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExpenseForm', () => {
    it('calcule le total au fur et à mesure de la saisie', () => {
        render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '42.50' } });

        expect(screen.getByText('42.50 €')).toBeTruthy();
    });

    it('ajoute et supprime des lignes de dépense', () => {
        render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
        expect(screen.getAllByPlaceholderText('Description (ex: Essence, Billet de train...)')).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer la dépense' })[0]);
        expect(screen.getAllByPlaceholderText('Description (ex: Essence, Billet de train...)')).toHaveLength(1);
    });

    it('refuse l\'enregistrement sans dépense valide', () => {
        render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText('Veuillez ajouter au moins une dépense valide avec un libellé et un montant supérieur à 0.')).toBeTruthy();
    });

    it('exige la déclaration sur l\'honneur ou une photo si remboursement demandé sans justificatif', () => {
        render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } });
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText(/Veuillez soit ajouter au moins un justificatif/)).toBeTruthy();
    });

    it('enregistre un brouillon (happy path)', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<ExpenseForm onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/expenses' && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.status).toBe('brouillon');
        expect(body.items).toEqual([{ label: 'Péage', amount: 20 }]);
    });

    it('ouvre la modale de signature puis soumet après confirmation', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<ExpenseForm onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Signer et Soumettre/ }));

        expect(screen.getByText('Modale de signature Yousign')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la signature' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.status).toBe('soumis');
    });

    it('affiche une erreur si l\'API échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Imputation invalide' }), { status: 400 }));

        render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(await screen.findByText('Imputation invalide')).toBeTruthy();
    });

    it('pré-remplit le formulaire en mode édition', () => {
        render(
            <ExpenseForm
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                initialData={{
                    id: 'expense-1',
                    imputation: 'UL',
                    customImputation: null,
                    requestRefund: true,
                    noReceiptDeclaration: false,
                    driveFolderId: null,
                    userFunction: 'Bénévole local',
                    userSignature: null,
                    items: [{ label: 'Repas', amount: 15.5 }],
                }}
            />
        );

        expect(screen.getByText('Modifier la note de frais')).toBeTruthy();
        expect(screen.getByDisplayValue('Repas')).toBeTruthy();
        expect(screen.getByDisplayValue('15.5')).toBeTruthy();
    });
});
