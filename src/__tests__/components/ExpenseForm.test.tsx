import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(() => ({ data: { user: { name: 'Jean Dupont', email: 'jean@test.com' } }, status: 'authenticated' })),
}));

vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
}));

vi.mock('@/components/expenses/ElectronicSignatureModal', () => ({
    default: ({ isOpen, onSign }: { isOpen: boolean; onSign: (sig: unknown, func: string) => void }) =>
        isOpen ? (
            <div>
                <span>Modale de signature électronique</span>
                <button onClick={() => onSign({ signed: true }, 'Bénévole local')}>Confirmer la signature</button>
            </div>
        ) : null,
}));

import ExpenseForm from '@/components/expenses/ExpenseForm';

/** Budgets actifs renvoyés par `GET /api/expense-budgets` — ni « N/A » ni archivé. */
const BUDGETS = [
    { id: 'b-repas', name: 'Repas' },
    { id: 'b-essence', name: 'Essence' },
];

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

/**
 * Mock `fetch` routé par URL.
 *
 * Le formulaire charge ses budgets au montage : sans cette route, tout rendu
 * échoue et l'enregistrement est désactivé. `budgetsResponse` permet de simuler
 * l'échec de chargement ou une liste vide.
 */
function mockFetch(
    handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
    budgetsResponse: () => Response = () => new Response(JSON.stringify(BUDGETS), { status: 200 }),
) {
    const mock = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
        if (getUrl(input).startsWith('/api/expense-budgets')) return budgetsResponse();
        return handler(input, init);
    });
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

type FormProps = Partial<React.ComponentProps<typeof ExpenseForm>>;

/** Rend le formulaire et attend que les budgets soient chargés. */
async function renderForm(props: FormProps = {}) {
    const utils = render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} {...props} />);
    await screen.findByRole('option', { name: 'Repas' });
    return utils;
}

/** Renseigne les champs mission, obligatoires pour toute création/édition. */
function fillMission(name = 'Maraude Nord', date = '2026-03-12') {
    fireEvent.change(screen.getByLabelText(/Nom de la mission/), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/Date de la mission/), { target: { value: date } });
}

/** Sélectionne un budget sur la ligne d'indice `idx`. */
function chooseBudget(idx = 0, value = 'b-repas') {
    fireEvent.change(screen.getAllByLabelText(/Budget/)[idx], { target: { value } });
}

/** Remplit une ligne de dépense complète : libellé, montant et budget. */
function fillItem(label = 'Péage', amount = '20', budgetId = 'b-repas') {
    fireEvent.change(screen.getAllByPlaceholderText('Description (ex: Essence, Billet de train...)')[0], { target: { value: label } });
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: amount } });
    chooseBudget(0, budgetId);
}

beforeEach(() => {
    vi.restoreAllMocks();
    // Mock par défaut : les budgets se chargent, tout autre appel répond 200.
    mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExpenseForm', () => {
    it('calcule le total au fur et à mesure de la saisie', async () => {
        await renderForm();

        fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '42.50' } });

        expect(screen.getByText('42.50 €')).toBeTruthy();
    });

    it('ajoute et supprime des lignes de dépense', async () => {
        await renderForm();

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
        expect(screen.getAllByPlaceholderText('Description (ex: Essence, Billet de train...)')).toHaveLength(2);
        expect(screen.getAllByLabelText(/Budget/)).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer la dépense' })[0]);
        expect(screen.getAllByPlaceholderText('Description (ex: Essence, Billet de train...)')).toHaveLength(1);
    });

    it('refuse l\'enregistrement sans dépense valide', async () => {
        await renderForm();

        fillMission();

        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText('Veuillez ajouter au moins une dépense valide avec un libellé et un montant supérieur à 0.')).toBeTruthy();
    });

    it('exige la déclaration sur l\'honneur ou une photo si remboursement demandé sans justificatif', async () => {
        await renderForm();

        fillMission();
        fillItem();
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText(/Veuillez soit ajouter au moins un justificatif/)).toBeTruthy();
    });

    it('n\'exige pas de nouvelle photo si des justificatifs sont déjà déposés (brouillon repris)', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));

        await renderForm({
            initialData: {
                id: 'expense-1',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                requestRefund: true,
                noReceiptDeclaration: false,
                pendingReceiptKeys: ['expenses-staging/s1/ticket.jpg'],
                items: [{ label: 'Péage', amount: 20, budgetId: 'b-repas' }],
            },
        });

        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.queryByText(/Veuillez soit ajouter au moins un justificatif/)).toBeNull();
        await vi.waitFor(() => expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'PATCH')).toBe(true));

        const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        // Les clés existantes sont retransmises telles quelles : aucun nouveau
        // fichier n'a été ajouté, donc aucun appel à /api/expenses/upload.
        expect(body.receiptKeys).toEqual(['expenses-staging/s1/ticket.jpg']);
        expect(fetchMock.mock.calls.some(c => getUrl(c[0]) === '/api/expenses/upload')).toBe(false);
    });

    it('enregistre un brouillon (happy path)', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        await renderForm({ onSuccess });

        fillMission();
        fillItem('Péage', '20', 'b-repas');
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/expenses' && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.status).toBe('brouillon');
        expect(body.items).toEqual([{ label: 'Péage', amount: 20, budgetId: 'b-repas' }]);
    });

    it('dépose un justificatif photo avant l\'enregistrement, sans passer par la déclaration sur l\'honneur', async () => {
        const fetchMock = mockFetch(async (input) => {
            const url = getUrl(input);
            if (url === '/api/expenses/upload') {
                return new Response(JSON.stringify({ success: true, stagingId: 'staging-1', keys: ['expenses-staging/staging-1/ticket.jpg'] }), { status: 200 });
            }
            return new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 });
        });
        const onSuccess = vi.fn();

        const { container } = await renderForm({ onSuccess });

        fillMission();
        fillItem();

        const fileInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        const photo = new File(['x'], 'ticket.jpg', { type: 'image/jpeg' });
        fireEvent.change(fileInput, { target: { files: [photo] } });
        // handleFiles est asynchrone (compressImages) : attendre que la vignette
        // apparaisse avant de soumettre, sinon `photos` est encore vide au clic.
        await screen.findByAltText('Aperçu');

        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());

        const uploadCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/expenses/upload');
        expect(uploadCall).toBeTruthy();
        expect((uploadCall![1] as RequestInit).body).toBeInstanceOf(FormData);

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/expenses' && (c[1] as RequestInit)?.method === 'POST');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.receiptKeys).toEqual(['expenses-staging/staging-1/ticket.jpg']);
    });

    it('affiche une erreur si le dépôt des justificatifs échoue (413)', async () => {
        mockFetch(async (input) => {
            const url = getUrl(input);
            if (url === '/api/expenses/upload') {
                return new Response(JSON.stringify({ error: 'trop lourd' }), { status: 413 });
            }
            return new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 });
        });

        const { container } = await renderForm();

        fillMission();
        fillItem();

        const fileInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })] } });
        await screen.findByAltText('Aperçu');
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(await screen.findByText(/413 Payload Too Large/)).toBeTruthy();
    });

    it('ouvre la modale de signature puis soumet après confirmation', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        await renderForm({ onSuccess });

        fillMission();
        fillItem();
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Signer et Soumettre/ }));

        expect(screen.getByText('Modale de signature électronique')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la signature' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST' && getUrl(c[0]) === '/api/expenses');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.status).toBe('soumis');
    });

    it('affiche une erreur si l\'API échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Imputation invalide' }), { status: 400 }));

        await renderForm();

        fillMission();
        fillItem();
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(await screen.findByText('Imputation invalide')).toBeTruthy();
    });

    it('refuse l\'enregistrement sans nom de mission', async () => {
        await renderForm();

        fireEvent.change(screen.getByLabelText(/Date de la mission/), { target: { value: '2026-03-12' } });
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText('Veuillez renseigner le nom de la mission.')).toBeTruthy();
    });

    it('refuse l\'enregistrement sans date de mission', async () => {
        await renderForm();

        fireEvent.change(screen.getByLabelText(/Nom de la mission/), { target: { value: 'Maraude Nord' } });
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText('Veuillez renseigner la date de la mission.')).toBeTruthy();
    });

    it('refuse une date de mission dans le futur', async () => {
        await renderForm();

        const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        fillMission('Maraude Nord', future);
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        expect(screen.getByText('La date de la mission ne peut pas être dans le futur.')).toBeTruthy();
    });

    it('transmet le nom et la date de mission dans le payload', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        await renderForm({ onSuccess });

        fillMission('  Poste de secours Marathon  ', '2026-04-05');
        fillItem('Repas', '12', 'b-repas');
        fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/expenses' && (c[1] as RequestInit)?.method === 'POST');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.missionName).toBe('Poste de secours Marathon');
        expect(body.missionDate).toBe('2026-04-05');
    });

    it('pré-remplit le formulaire en mode édition', async () => {
        await renderForm({
            initialData: {
                id: 'expense-1',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                imputation: 'UL',
                customImputation: null,
                requestRefund: true,
                noReceiptDeclaration: false,
                pendingReceiptKeys: [],
                userFunction: 'Bénévole local',
                userSignature: null,
                items: [{ label: 'Repas', amount: 15.5, budgetId: 'b-essence' }],
            },
        });

        expect(screen.getByText('Modifier la note de frais')).toBeTruthy();
        expect(screen.getByDisplayValue('Repas')).toBeTruthy();
        expect(screen.getByDisplayValue('15.5')).toBeTruthy();
        expect((screen.getByLabelText(/Budget/) as HTMLSelectElement).value).toBe('b-essence');
    });

    describe('budget analytique par ligne', () => {
        it('le select de budget est accessible par son libellé', async () => {
            await renderForm();

            const select = screen.getByLabelText(/Budget/) as HTMLSelectElement;
            expect(select.tagName).toBe('SELECT');
            // .form-select porte le chevron SVG ; .form-input ne l'a pas.
            expect(select.className).toContain('form-select');
            expect(select.id).toBe('budget-0');
        });

        it('le select de budget ne propose ni N/A ni budget archivé', async () => {
            await renderForm();

            const options = Array.from((screen.getByLabelText(/Budget/) as HTMLSelectElement).options).map(o => o.textContent);
            expect(options).toEqual(['-- Choisir un budget --', 'Repas', 'Essence']);
            expect(options).not.toContain('N/A');
        });

        it('la soumission est bloquée côté client si une ligne n\'a pas de budget', async () => {
            const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));

            await renderForm();

            fillMission();
            fireEvent.change(screen.getByPlaceholderText('Description (ex: Essence, Billet de train...)'), { target: { value: 'Péage' } });
            fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } });
            fireEvent.click(screen.getByRole('checkbox', { name: /Je n'ai pas de justificatifs/ }));
            fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

            expect(screen.getByText('Veuillez rattacher chaque ligne de dépense à un budget.')).toBeTruthy();
            expect(fetchMock.mock.calls.some(c => getUrl(c[0]) === '/api/expenses')).toBe(false);
        });

        it('un brouillon historique sans budgetId exige un choix avant enregistrement', async () => {
            const fetchMock = mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));

            await renderForm({
                initialData: {
                    id: 'expense-1',
                    missionName: 'Maraude Nord',
                    missionDate: '2026-03-12',
                    requestRefund: false,
                    noReceiptDeclaration: false,
                    pendingReceiptKeys: [],
                    // Ligne antérieure à la feature : aucun budget rattaché.
                    items: [{ label: 'Péage', amount: 20, budgetId: null }],
                },
            });

            expect((screen.getByLabelText(/Budget/) as HTMLSelectElement).value).toBe('');

            fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));
            expect(screen.getByText('Veuillez rattacher chaque ligne de dépense à un budget.')).toBeTruthy();
            expect(fetchMock.mock.calls.some(c => getUrl(c[0]).startsWith('/api/expenses/expense-1'))).toBe(false);

            chooseBudget(0, 'b-repas');
            fireEvent.click(screen.getByRole('button', { name: /Enregistrer Brouillon/ }));

            await waitFor(() => expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'PATCH')).toBe(true));
            const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
            const body = JSON.parse((patchCall![1] as RequestInit).body as string);
            expect(body.items).toEqual([{ label: 'Péage', amount: 20, budgetId: 'b-repas' }]);
        });

        it('un utilisateur multi-UL voit les budgets de l\'UL de la note, pas de son UL active', async () => {
            const fetchMock = mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));

            await renderForm({
                initialData: {
                    id: 'expense-1',
                    missionName: 'Maraude Nord',
                    missionDate: '2026-03-12',
                    requestRefund: false,
                    noReceiptDeclaration: false,
                    pendingReceiptKeys: [],
                    items: [{ label: 'Péage', amount: 20, budgetId: 'b-repas' }],
                    // UL de la note, distincte de l'UL active de la session.
                    ulId: 'ul-paris-17',
                },
            });

            expect(fetchMock.mock.calls.some(c => getUrl(c[0]) === '/api/expense-budgets?ulId=ul-paris-17')).toBe(true);
        });

        it('à la création, aucun ulId n\'est transmis : le serveur retient l\'UL de session', async () => {
            const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }));

            await renderForm();

            expect(fetchMock.mock.calls.some(c => getUrl(c[0]) === '/api/expense-budgets')).toBe(true);
            expect(fetchMock.mock.calls.some(c => getUrl(c[0]).includes('ulId='))).toBe(false);
        });

        it('aucun enregistrement n\'est possible si la liste de budgets est vide ou en erreur', async () => {
            // Cas 1 — le GET échoue (table absente en production, réseau coupé…).
            const failing = mockFetch(
                async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }),
                () => new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 }),
            );
            const { unmount } = render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

            expect(await screen.findByText(/Impossible de charger la liste des budgets/)).toBeTruthy();
            expect((screen.getByRole('button', { name: /Enregistrer Brouillon/ }) as HTMLButtonElement).disabled).toBe(true);
            expect((screen.getByRole('button', { name: /Signer et Soumettre/ }) as HTMLButtonElement).disabled).toBe(true);
            expect(failing.mock.calls.some(c => getUrl(c[0]) === '/api/expenses')).toBe(false);
            unmount();

            // Cas 2 — le GET réussit mais renvoie une liste vide.
            const empty = mockFetch(
                async () => new Response(JSON.stringify({ id: 'expense-1' }), { status: 200 }),
                () => new Response(JSON.stringify([]), { status: 200 }),
            );
            render(<ExpenseForm onClose={vi.fn()} onSuccess={vi.fn()} />);

            expect(await screen.findByText(/Impossible de charger la liste des budgets/)).toBeTruthy();
            expect((screen.getByRole('button', { name: /Enregistrer Brouillon/ }) as HTMLButtonElement).disabled).toBe(true);
            expect(empty.mock.calls.some(c => getUrl(c[0]) === '/api/expenses')).toBe(false);
        });
    });
});
