import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MultiSelectDropdown from '@/components/stats/MultiSelectDropdown';

const options = [
    { id: 'o1', label: 'Jean Dupont' },
    { id: 'o2', label: 'Marie Curie' },
];

describe('MultiSelectDropdown', () => {
    it('affiche le placeholder sans sélection', () => {
        render(<MultiSelectDropdown options={options} value={[]} onChange={vi.fn()} placeholder="Sélectionner..." />);
        expect(screen.getByText('Sélectionner...')).toBeTruthy();
    });

    it('affiche le label unique pour une seule sélection', () => {
        render(<MultiSelectDropdown options={options} value={['o1']} onChange={vi.fn()} placeholder="Sélectionner..." />);
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('affiche le compteur pour plusieurs sélections', () => {
        render(<MultiSelectDropdown options={options} value={['o1', 'o2']} onChange={vi.fn()} placeholder="Sélectionner..." />);
        expect(screen.getByText('2 sélectionnés')).toBeTruthy();
    });

    it('ouvre le menu et sélectionne une option (happy path)', () => {
        const onChange = vi.fn();
        render(<MultiSelectDropdown options={options} value={[]} onChange={onChange} placeholder="Sélectionner..." />);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner/ }));
        fireEvent.click(screen.getByText('Jean Dupont'));

        expect(onChange).toHaveBeenCalledWith(['o1']);
    });

    it('désélectionne une option déjà cochée', () => {
        const onChange = vi.fn();
        render(<MultiSelectDropdown options={options} value={['o1']} onChange={onChange} placeholder="Sélectionner..." />);

        fireEvent.click(screen.getByRole('button', { name: /Jean Dupont/ }));
        fireEvent.click(screen.getByRole('checkbox', { checked: true }));

        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('filtre les options par recherche', () => {
        render(<MultiSelectDropdown options={options} value={[]} onChange={vi.fn()} placeholder="Sélectionner..." />);
        fireEvent.click(screen.getByRole('button', { name: /Sélectionner/ }));
        fireEvent.change(screen.getByPlaceholderText('Rechercher...'), { target: { value: 'marie' } });

        expect(screen.queryByText('Jean Dupont')).toBeNull();
        expect(screen.getByText('Marie Curie')).toBeTruthy();
    });

    it('affiche "Aucun résultat" si la recherche ne matche rien', () => {
        render(<MultiSelectDropdown options={options} value={[]} onChange={vi.fn()} placeholder="Sélectionner..." />);
        fireEvent.click(screen.getByRole('button', { name: /Sélectionner/ }));
        fireEvent.change(screen.getByPlaceholderText('Rechercher...'), { target: { value: 'zzz' } });

        expect(screen.getByText('Aucun résultat')).toBeTruthy();
    });

    it('efface la sélection au clic sur le bouton Effacer', () => {
        const onChange = vi.fn();
        render(<MultiSelectDropdown options={options} value={['o1', 'o2']} onChange={onChange} placeholder="Sélectionner..." />);
        fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
