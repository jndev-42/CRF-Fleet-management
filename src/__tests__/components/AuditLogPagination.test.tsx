import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AuditLogPagination from '@/components/admin/AuditLogPagination';

describe('AuditLogPagination', () => {
    it('affiche la plage, la page courante et navigue', () => {
        const onChange = vi.fn();
        render(<AuditLogPagination page={2} totalPages={3} total={25} pageSize={10} onChange={onChange} />);
        expect(screen.getByText('11 à 20 sur 25 événements')).toBeTruthy();
        expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(onChange.mock.calls).toEqual([[1], [3]]);
    });

    it('accorde « événement » au singulier et désactive les deux boutons sur une page unique', () => {
        render(<AuditLogPagination page={1} totalPages={1} total={1} pageSize={10} onChange={vi.fn()} />);
        expect(screen.getByText('1 à 1 sur 1 événement')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
