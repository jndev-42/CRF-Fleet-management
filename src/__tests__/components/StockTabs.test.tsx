import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StockTabs from '@/components/inventory/StockTabs';
import { InvStockListRow } from '@/lib/inventory/stocks';

const stock = (id: string, name: string, isDefault = 0): InvStockListRow => ({
    id,
    name,
    ulId: 'ul-test',
    isDefault,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
});

const baseProps = {
    activeStockId: 's1',
    onSelectStock: vi.fn(),
    onOpenCreate: vi.fn(),
    onOpenRename: vi.fn(),
    onOpenDuplicate: vi.fn(),
    onDeleteStock: vi.fn(),
};

describe('StockTabs', () => {
    it('masque le bouton de duplication pour un non-admin', () => {
        render(<StockTabs {...baseProps} stocks={[stock('s1', 'Stock Principal', 1)]} isAdmin={false} />);
        expect(screen.queryByTitle('Dupliquer le stock')).toBeNull();
    });

    it('affiche le bouton de duplication sur chaque onglet pour un admin', () => {
        render(
            <StockTabs
                {...baseProps}
                stocks={[stock('s1', 'Stock Principal', 1), stock('s2', 'Stock Véhicules')]}
                isAdmin
            />
        );
        expect(screen.getAllByTitle('Dupliquer le stock')).toHaveLength(2);
    });

    it('affiche le bouton de duplication même avec un seul stock, contrairement à la suppression', () => {
        render(<StockTabs {...baseProps} stocks={[stock('s1', 'Stock Principal', 1)]} isAdmin />);
        expect(screen.getAllByTitle('Dupliquer le stock')).toHaveLength(1);
        expect(screen.queryByTitle('Supprimer le stock')).toBeNull();
    });

    it('remonte le stock cliqué sans activer son onglet', () => {
        const onOpenDuplicate = vi.fn();
        const onSelectStock = vi.fn();
        render(
            <StockTabs
                {...baseProps}
                onOpenDuplicate={onOpenDuplicate}
                onSelectStock={onSelectStock}
                stocks={[stock('s1', 'Stock Principal', 1), stock('s2', 'Stock Véhicules')]}
                isAdmin
            />
        );

        fireEvent.click(screen.getAllByTitle('Dupliquer le stock')[1]);

        expect(onOpenDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
        expect(onSelectStock).not.toHaveBeenCalled();
    });
});
