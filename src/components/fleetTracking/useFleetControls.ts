'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTROL_FILTERS, parisDay, type ControlCounts, type ControlRow } from '@/lib/fleetTracking/controls';
import { readError } from './useFleetContacts';

export const CONTROLS_URL = '/api/fleet-tracking/controls';
export const APPOINTMENTS_URL = `${CONTROLS_URL}/appointments`;

const EMPTY_COUNTS = Object.fromEntries(CONTROL_FILTERS.map(f => [f, 0])) as ControlCounts;

/**
 * Échéances de contrôle de l'UL, avec effectifs par filtre et jour de référence du
 * serveur (`today`, Europe/Paris). Une lecture dépassée est ignorée.
 */
export function useFleetControls() {
    const [controls, setControls] = useState<ControlRow[]>([]);
    const [counts, setCounts] = useState<ControlCounts>(EMPTY_COUNTS);
    const [today, setToday] = useState(() => parisDay());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);

    const refetch = useCallback(async () => {
        const current = ++seq.current;
        try {
            const res = await fetch(CONTROLS_URL, { cache: 'no-store' });
            if (current !== seq.current) return;
            if (!res.ok) {
                const message = await readError(res, 'Chargement des contrôles impossible');
                if (current === seq.current) setError(message);
                return;
            }
            const data = await res.json() as { controls: ControlRow[]; counts: ControlCounts; today?: string };
            if (current !== seq.current) return;
            setControls(data.controls);
            setCounts(data.counts);
            if (data.today) setToday(data.today);
            setError(null);
        } catch {
            if (current === seq.current) setError('Chargement des contrôles impossible');
        } finally {
            if (current === seq.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    return { controls, counts, today, loading, error, refetch };
}
