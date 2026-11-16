import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UserCombobox from '@/components/ui/UserCombobox';

const sessionMock = vi.hoisted(() => ({ ulId: undefined as string | undefined }));
vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: sessionMock.ulId ? { user: { ulId: sessionMock.ulId } } : null, status: 'authenticated' }),
}));

const users = [
    { id: 'u1', name: 'Jean Dupont', email: 'jean@test.com' },
    { id: 'u2', name: null, email: 'marie@test.com' },
];

describe('UserCombobox', () => {
    it('affiche le label par défaut sans sélection', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} defaultLabel="— Choisir —" />);
        expect(screen.getByText('— Choisir —')).toBeTruthy();
    });

    it('affiche le nom de l\'utilisateur sélectionné', () => {
        render(<UserCombobox users={users} value="u1" onChange={vi.fn()} />);
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('retombe sur l\'email si l\'utilisateur n\'a pas de nom', () => {
        render(<UserCombobox users={users} value="u2" onChange={vi.fn()} />);
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('ouvre le menu déroulant au clic sur le déclencheur', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('listbox')).toBeTruthy();
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('filtre les utilisateurs par recherche (nom ou email)', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'marie' } });

        expect(screen.queryByText('Jean Dupont')).toBeNull();
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('exclut un utilisateur par email (excludeEmail)', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} excludeEmail="jean@test.com" />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText('Jean Dupont')).toBeNull();
    });

    it('sélectionne un utilisateur et ferme le menu', () => {
        const onChange = vi.fn();
        render(<UserCombobox users={users} value="" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByText('Jean Dupont'));

        expect(onChange).toHaveBeenCalledWith('u1');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('affiche "Chauffeur non décidé" pour la valeur spéciale UNASSIGNED', () => {
        render(<UserCombobox users={users} value="UNASSIGNED" onChange={vi.fn()} />);
        expect(screen.getByText('Chauffeur non décidé')).toBeTruthy();
    });

    it('hideDefault : masque l\'entrée par défaut et affiche « Choisir un chauffeur » sans sélection', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} hideDefault />);
        expect(screen.getByText('Choisir un chauffeur')).toBeTruthy();
        fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText('Moi-même')).toBeNull();
        expect(screen.getAllByRole('option')).toHaveLength(users.length);
    });

    describe('filtre « Mon UL »', () => {
        const ulUsers = [
            { id: 'a', name: 'Alice Dupont', email: 'alice@test.com', ulIds: ['ul-a'] },
            { id: 'b', name: 'Bruno Dupond', email: 'bruno@test.com', ulIds: ['ul-b'] },
            { id: 'c', name: 'Chloé Martin', email: 'chloe@test.com', ulIds: ['ul-b', 'ul-a'] },
            { id: 'd', name: 'Denis Sans', email: 'denis@test.com' },
        ];
        const open = () => fireEvent.click(screen.getByRole('button', { name: /Moi-même|Alice|Bruno/ }));

        beforeEach(() => { sessionMock.ulId = 'ul-a'; });
        afterEach(() => { sessionMock.ulId = undefined; });

        it('ne garde que les personnes de l\'UL active, rattachement secondaire compris', () => {
            render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} />);
            open();
            expect(screen.getAllByRole('option')).toHaveLength(1 + 4);
            fireEvent.click(screen.getByRole('button', { name: 'Mon UL' }));
            expect(screen.getByText('Alice Dupont')).toBeTruthy();
            expect(screen.getByText('Chloé Martin')).toBeTruthy();
            expect(screen.queryByText('Bruno Dupond')).toBeNull();
            expect(screen.queryByText('Denis Sans')).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Toutes les UL' }));
            expect(screen.getByText('Bruno Dupond')).toBeTruthy();
        });

        it('cumule la recherche et le filtre', () => {
            render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} />);
            open();
            fireEvent.click(screen.getByRole('button', { name: 'Mon UL' }));
            fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DUP' } });
            expect(screen.getByText('Alice Dupont')).toBeTruthy();
            expect(screen.queryByText('Bruno Dupond')).toBeNull();
            expect(screen.queryByText('Chloé Martin')).toBeNull();
        });

        it('affiche « Aucune personne trouvée » sans résultat', () => {
            render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} hideDefault />);
            fireEvent.click(screen.getByRole('button'));
            fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } });
            expect(screen.getByText('Aucune personne trouvée')).toBeTruthy();
        });

        it("n'affiche pas « Aucune personne trouvée » tant qu'aucune recherche ni filtre n'est actif", () => {
            render(<UserCombobox users={[]} value="" onChange={vi.fn()} />);
            fireEvent.click(screen.getByRole('button'));
            expect(screen.queryByText('Aucune personne trouvée')).toBeNull();
        });

        it('garde la valeur choisie dans le déclencheur même masquée par le filtre', () => {
            render(<UserCombobox users={ulUsers} value="b" onChange={vi.fn()} />);
            fireEvent.click(screen.getByRole('button', { name: /Bruno/ }));
            fireEvent.click(screen.getByRole('button', { name: 'Mon UL' }));
            expect(screen.getByRole('button', { name: /Bruno Dupond/ })).toBeTruthy();
            expect(screen.queryByRole('option', { name: 'Bruno Dupond' })).toBeNull();
        });

        it('rouvre sur « Toutes les UL »', () => {
            render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} />);
            open();
            fireEvent.click(screen.getByRole('button', { name: 'Mon UL' }));
            fireEvent.click(screen.getByRole('button', { name: /Moi-même/ }));
            open();
            expect(screen.getByRole('button', { name: 'Toutes les UL' }).getAttribute('aria-pressed')).toBe('true');
        });

        it('masque le sélecteur sans UL active ou avec « default »', () => {
            sessionMock.ulId = undefined;
            const { unmount } = render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} />);
            fireEvent.click(screen.getByRole('button'));
            expect(screen.queryByRole('button', { name: 'Mon UL' })).toBeNull();
            unmount();
            sessionMock.ulId = 'default';
            render(<UserCombobox users={ulUsers} value="" onChange={vi.fn()} />);
            fireEvent.click(screen.getByRole('button'));
            expect(screen.queryByRole('button', { name: 'Mon UL' })).toBeNull();
        });
    });
});
