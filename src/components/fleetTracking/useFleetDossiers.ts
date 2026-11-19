'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DossierStatus, FleetDossier, FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import { readError } from './useFleetContacts';

export const DOSSIERS_URL = '/api/fleet-tracking/dossiers';

export interface DossierFilterState {
    /** `''` : tous. */
    status: '' | DossierStatus;
    vehicle: string;
}

export const DEFAULT_DOSSIER_FILTERS: DossierFilterState = { status: 'OPEN', vehicle: '' };

export function dossierFiltersQuery(f: DossierFilterState): string {
    const params = new URLSearchParams();
    if (f.status) params.set('status', f.status);
    if (f.vehicle) params.set('vehicle', f.vehicle);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

/** Lecture d'une liste de dossiers ; les réponses périmées (filtre changé entre-temps) sont ignorées. */
export function useDossierList(query: string) {
    const [dossiers, setDossiers] = useState<FleetDossier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);

    const refetch = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const res = await fetch(`${DOSSIERS_URL}${query}`, { cache: 'no-store' });
            if (mine !== seq.current) return;
            if (!res.ok) {
                setError(await readError(res, 'Chargement des dossiers impossible'));
                return;
            }
            const data = await res.json() as { dossiers?: FleetDossier[] };
            if (mine !== seq.current) return;
            setDossiers(Array.isArray(data.dossiers) ? data.dossiers : []);
            setError(null);
        } catch (e: unknown) {
            console.error('Chargement des dossiers :', e);
            if (mine === seq.current) setError('Chargement des dossiers impossible');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    return { dossiers, loading, error, refetch };
}

export type DossierLoad =
    | { state: 'loading' }
    | { state: 'error'; message: string }
    | { state: 'ready'; dossier: FleetDossierDetail };

/** Détail d'un dossier ; `refetch` le relit (après une modification de tâche, par exemple). */
export function useDossierDetail(dossierId: string) {
    const [load, setLoad] = useState<DossierLoad>({ state: 'loading' });
    const seq = useRef(0);

    const refetch = useCallback(async () => {
        const mine = ++seq.current;
        try {
            const res = await fetch(`${DOSSIERS_URL}/${encodeURIComponent(dossierId)}`, { cache: 'no-store' });
            if (mine !== seq.current) return;
            if (!res.ok) {
                const message = res.status === 403
                    ? 'Ce dossier appartient à une autre unité locale : changez d’UL dans l’en-tête pour l’ouvrir.'
                    : res.status === 404
                        ? 'Dossier introuvable'
                        : await readError(res, 'Ouverture du dossier impossible.');
                setLoad({ state: 'error', message });
                return;
            }
            const data = await res.json() as { dossier: FleetDossierDetail };
            if (mine === seq.current) setLoad({ state: 'ready', dossier: data.dossier });
        } catch {
            if (mine === seq.current) setLoad({ state: 'error', message: 'Ouverture du dossier impossible.' });
        }
    }, [dossierId]);

    const refetchRef = useRef(refetch);
    useEffect(() => {
        refetchRef.current = refetch;
        void refetchRef.current();
    }, [refetch]);

    /** Mise à jour locale (pièce cochée, pièce jointe ajoutée…) sans relecture. */
    const update = useCallback((fn: (d: FleetDossierDetail) => FleetDossierDetail) => {
        setLoad(prev => (prev.state === 'ready' ? { state: 'ready', dossier: fn(prev.dossier) } : prev));
    }, []);

    return { load, refetch, update };
}

/** Choix de dossier d'une tâche : dossiers de l'UL (ouverts et clos, le sélecteur filtre). */
export function useDossierOptions() {
    const [dossiers, setDossiers] = useState<FleetDossier[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(DOSSIERS_URL, { cache: 'no-store' });
                if (!res.ok || cancelled) return;
                const data = await res.json() as { dossiers?: FleetDossier[] };
                if (!cancelled && Array.isArray(data.dossiers)) setDossiers(data.dossiers);
            } catch (e: unknown) {
                console.error('Chargement des dossiers :', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return dossiers;
}
