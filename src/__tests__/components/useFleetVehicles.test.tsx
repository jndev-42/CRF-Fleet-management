/**
 * Tests du hook de chargement de la flotte (Vue UL / Vue DT).
 *
 * Fichier testé : src/app/vehicles/useFleetVehicles.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFleetVehicles } from '@/app/vehicles/useFleetVehicles';
import type { DtFetchWindow } from '@/app/vehicles/useDtFilters';

const FROM = '2026-10-10T06:00:00.000Z';
const TO = '2026-10-10T18:00:00.000Z';

function jsonResponse(data: unknown, ok = true) {
    return { ok, json: async () => data } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const vehicleCalls = () => fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith('/api/vehicles'));

describe('useFleetVehicles', () => {
    it('Vue DT, période : envoie view=dt&from=&to=', async () => {
        fetchMock.mockResolvedValue(jsonResponse([]));
        const { result } = renderHook(() => useFleetVehicles({ enabled: true, isDtView: true, dtWindow: { from: FROM, to: TO }, ulKey: 'ul-1' }));

        await waitFor(() => expect(result.current.loading).toBe(false));
        const url = new URL(vehicleCalls()[0], 'http://localhost');
        expect(url.searchParams.get('view')).toBe('dt');
        expect(url.searchParams.get('from')).toBe(FROM);
        expect(url.searchParams.get('to')).toBe(TO);
        expect(result.current.hasDtData).toBe(true);
    });

    it('fenêtre « invalid » : aucun appel et le chargement se termine', async () => {
        const { result } = renderHook(() => useFleetVehicles({ enabled: true, isDtView: true, dtWindow: 'invalid', ulKey: 'ul-1' }));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current.hasDtData).toBe(false);
    });

    it('réponses dans le désordre : la plus récente l’emporte', async () => {
        let resolveFirst: (r: Response) => void = () => undefined;
        fetchMock
            .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
            .mockImplementationOnce(() => Promise.resolve(jsonResponse([{ id: 'recent', name: 'recent' }])));

        const { result, rerender } = renderHook(
            ({ dtWindow }: { dtWindow: DtFetchWindow }) => useFleetVehicles({ enabled: true, isDtView: true, dtWindow, ulKey: 'ul-1' }),
            { initialProps: { dtWindow: { from: FROM, to: TO } as DtFetchWindow } },
        );
        rerender({ dtWindow: { from: FROM, to: '2026-10-10T20:00:00.000Z' } });
        await waitFor(() => expect(result.current.vehicles.map((v) => v.id)).toEqual(['recent']));

        await act(async () => { resolveFirst(jsonResponse([{ id: 'ancien', name: 'ancien' }])); });
        expect(result.current.vehicles.map((v) => v.id)).toEqual(['recent']);
        expect(result.current.loading).toBe(false);
    });

    it('télémétrie Renault chargée une seule fois par vue et par UL', async () => {
        const connected = { id: 'v1', name: 'VSAV 1', vin: 'VIN1', connection: { status: 'CONNECTED' } };
        fetchMock.mockImplementation((url: string) =>
            Promise.resolve(jsonResponse(url.startsWith('/api/renault') ? { totalMileage: 1 } : [connected])));

        const { result, rerender } = renderHook(
            ({ dtWindow }: { dtWindow: DtFetchWindow }) => useFleetVehicles({ enabled: true, isDtView: true, dtWindow, ulKey: 'ul-1' }),
            { initialProps: { dtWindow: null as DtFetchWindow } },
        );
        await waitFor(() => expect(result.current.renaultData['VSAV 1']).toBeTruthy());

        rerender({ dtWindow: { from: FROM, to: TO } });
        await waitFor(() => expect(vehicleCalls()).toHaveLength(2));
        await waitFor(() => expect(result.current.loading).toBe(false));

        const renaultCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).startsWith('/api/renault'));
        expect(renaultCalls).toHaveLength(1);
    });
});
