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
    onOpenImport: vi.fn(),
    onOpenRename: vi.fn(),
    onOpenDuplicate: vi.fn(),
    onOpenQrCode: vi.fn(),
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

    // ── QR Code du stock ─────────────────────────────────────────────────────

    it('masque le bouton QR Code pour un non-admin (AC-Q1)', () => {
        render(<StockTabs {...baseProps} stocks={[stock('s1', 'Stock Principal', 1)]} isAdmin={false} />);
        expect(screen.queryByTitle('QR Code du stock')).toBeNull();
    });

    it('affiche un bouton QR Code par onglet pour un admin (AC-Q2)', () => {
        render(
            <StockTabs
                {...baseProps}
                stocks={[stock('s1', 'Stock Principal', 1), stock('s2', 'Stock Véhicules')]}
                isAdmin
            />
        );
        expect(screen.getAllByTitle('QR Code du stock')).toHaveLength(2);
    });

    it('remonte le stock du QR sans activer son onglet (AC-Q3)', () => {
        const onOpenQrCode = vi.fn();
        const onSelectStock = vi.fn();
        render(
            <StockTabs
                {...baseProps}
                onOpenQrCode={onOpenQrCode}
                onSelectStock={onSelectStock}
                stocks={[stock('s1', 'Stock Principal', 1), stock('s2', 'Stock Véhicules')]}
                isAdmin
            />
        );

        fireEvent.click(screen.getAllByTitle('QR Code du stock')[1]);

        expect(onOpenQrCode).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
        expect(onSelectStock).not.toHaveBeenCalled();
    });

    // ── Import CSV ───────────────────────────────────────────────────────────

    it('masque le bouton d\'import CSV pour un non-admin', () => {
        render(<StockTabs {...baseProps} stocks={[stock('s1', 'Stock Principal', 1)]} isAdmin={false} />);
        expect(screen.queryByTitle('Importer un CSV')).toBeNull();
    });

    it('affiche un unique bouton d\'import CSV pour un admin', () => {
        render(
            <StockTabs
                {...baseProps}
                stocks={[stock('s1', 'Stock Principal', 1), stock('s2', 'Stock Véhicules')]}
                isAdmin
            />
        );
        expect(screen.getAllByTitle('Importer un CSV')).toHaveLength(1);
    });

    it('remonte l\'ouverture de la modale d\'import', () => {
        const onOpenImport = vi.fn();
        render(
            <StockTabs
                {...baseProps}
                onOpenImport={onOpenImport}
                stocks={[stock('s1', 'Stock Principal', 1)]}
                isAdmin
            />
        );

        fireEvent.click(screen.getByTitle('Importer un CSV'));

        expect(onOpenImport).toHaveBeenCalled();
    });
});
