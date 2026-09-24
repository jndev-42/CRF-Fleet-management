/**
 * Tests RTL — `LaundryList` (liste « À laver »), partagée appli / QR.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LaundryList from '@/components/uniforms/LaundryList';

let pieces: unknown[];
let markStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    pieces = [{ loanId: 'l1', itemName: 'Polo', sizeLabel: 'M', returnedAt: '2026-09-24T08:00:00.000Z', returnComment: 'Boue' }];
    markStatus = 200;
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            if (markStatus === 200) pieces = [];
            return new Response(JSON.stringify(markStatus === 200 ? { success: true } : { error: 'Cette pièce a déjà été marquée lavée' }), { status: markStatus });
        }
        return new Response(JSON.stringify({ pieces }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

const markUrl = (id: string) => `/api/qr-uniforms/tok/laundry/${id}`;

describe('LaundryList', () => {
    it('liste les pièces sales avec leur commentaire', async () => {
        render(<LaundryList listUrl="/api/qr-uniforms/tok/laundry" markUrl={markUrl} />);
        expect(await screen.findByText('Polo M')).toBeTruthy();
        expect(screen.getByText(/« Boue »/)).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/qr-uniforms/tok/laundry');
    });

    it('« Marquer lavée » appelle la route et retire la pièce de la liste', async () => {
        render(<LaundryList listUrl="/api/uniforms/laundry" markUrl={markUrl} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Marquer lavée : Polo M' }));
        expect(await screen.findByText('Aucune pièce à laver.')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/qr-uniforms/tok/laundry/l1', { method: 'POST' });
    });

    it('affiche le 409 inline', async () => {
        markStatus = 409;
        render(<LaundryList listUrl="/api/uniforms/laundry" markUrl={markUrl} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Marquer lavée : Polo M' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/déjà été marquée lavée/));
    });
});
