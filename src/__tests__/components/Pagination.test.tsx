import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Pagination from '@/components/Pagination';

function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('Pagination', () => {
    it('affiche « Page X sur Y » et navigue vers la page précédente / suivante', () => {
        const onChange = vi.fn();
        render(<Pagination label="Pagination test" page={2} totalPages={3} onChange={onChange} />);
        expect(screen.getByRole('navigation', { name: 'Pagination test' })).toBeTruthy();
        expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
        fireEvent.click(button('Page précédente'));
        fireEvent.click(button('Page suivante'));
        expect(onChange.mock.calls).toEqual([[1], [3]]);
    });

    it('désactive les boutons aux bornes', () => {
        const { rerender } = render(<Pagination label="P" page={1} totalPages={2} onChange={vi.fn()} extended />);
        expect(button('Page précédente').disabled).toBe(true);
        expect(button('Première page').disabled).toBe(true);
        expect(button('Page suivante').disabled).toBe(false);

        rerender(<Pagination label="P" page={2} totalPages={2} onChange={vi.fn()} extended />);
        expect(button('Page suivante').disabled).toBe(true);
        expect(button('Dernière page').disabled).toBe(true);
    });

    it('sans `extended`, ni première / dernière page ni saisie de page', () => {
        render(<Pagination label="P" page={2} totalPages={9} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Première page' })).toBeNull();
        expect(screen.queryByLabelText('Aller à')).toBeNull();
    });

    it('affiche le résumé et les contrôles additionnels', () => {
        render(
            <Pagination label="P" page={1} totalPages={2} onChange={vi.fn()} summary="1 à 10 sur 12 notes">
                <span>Afficher : 10</span>
            </Pagination>,
        );
        expect(screen.getByText('1 à 10 sur 12 notes')).toBeTruthy();
        expect(screen.getByText('Afficher : 10')).toBeTruthy();
    });

    it('`extended` : première / dernière page', () => {
        const onChange = vi.fn();
        render(<Pagination label="P" page={4} totalPages={9} onChange={onChange} extended />);
        fireEvent.click(button('Première page'));
        fireEvent.click(button('Dernière page'));
        expect(onChange.mock.calls).toEqual([[1], [9]]);
    });

    it('« Aller à » saute à la page saisie, bornée au nombre de pages', () => {
        const onChange = vi.fn();
        render(<Pagination label="P" page={1} totalPages={9} onChange={onChange} extended />);
        const input = screen.getByLabelText('Aller à');

        fireEvent.change(input, { target: { value: '5' } });
        fireEvent.click(button('OK'));
        fireEvent.change(input, { target: { value: '40' } });
        fireEvent.submit(input.closest('form')!);
        expect(onChange.mock.calls).toEqual([[5], [9]]);
    });

    it('« Aller à » ignore une saisie vide, décimale ou identique à la page courante', () => {
        const onChange = vi.fn();
        render(<Pagination label="P" page={3} totalPages={9} onChange={onChange} extended />);
        const input = screen.getByLabelText('Aller à');
        for (const value of ['', '2.5', '3']) {
            fireEvent.change(input, { target: { value } });
            fireEvent.click(button('OK'));
        }
        expect(onChange).not.toHaveBeenCalled();
    });

    it("« Aller à » n'apparaît qu'au-delà de deux pages", () => {
        render(<Pagination label="P" page={1} totalPages={2} onChange={vi.fn()} extended />);
        expect(screen.queryByLabelText('Aller à')).toBeNull();
    });
});
