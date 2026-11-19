'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetOverview } from '@/lib/fleetTracking/overview';
import { readError } from './useFleetContacts';

export const OVERVIEW_URL = '/api/fleet-tracking/overview';

/**
 * Vue d'ensemble de l'UL (compteurs, prochaines actions, encart prioritaire,
 * véhicules, badges des sous-onglets), relue quand `version` change ou par `refetch`.
 * Les réponses périmées (une lecture plus récente est partie) sont ignorées.
 */
export function useFleetOverview(version: number) {
    const [overview, setOverview] = useState<FleetOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);

    const refetch = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const res = await fetch(OVERVIEW_URL, { cache: 'no-store' });
            if (mine !== seq.current) return;
            if (!res.ok) {
                setError(await readError(res, 'Chargement de la vue d’ensemble impossible'));
                return;
            }
            const data = await res.json() as FleetOverview;
            if (mine !== seq.current) return;
            setOverview(data);
            setError(null);
        } catch (e: unknown) {
            console.error('Chargement de la vue d’ensemble :', e);
            if (mine === seq.current) setError('Chargement de la vue d’ensemble impossible');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch, version]);

    return { overview, loading, error, refetch };
}
