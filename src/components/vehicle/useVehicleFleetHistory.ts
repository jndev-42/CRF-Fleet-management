'use client';

import { useEffect, useState } from 'react';
import type { VehicleHistoryEntry } from '@/lib/fleetTracking/dossiers';
import { readError } from '@/components/fleetTracking/useFleetContacts';

export interface VehicleFleetHistory {
    vehicle: { id: string; name: string };
    entries: VehicleHistoryEntry[];
}

/**
 * Historique technique d'un véhicule (`GET /api/fleet-tracking/vehicles/<nom>/history`).
 * `refused` : accès refusé ou véhicule inconnu (403 / 404) — la section se masque ;
 * `error` : panne serveur ou réseau — la section affiche le message.
 * Tout est remis à zéro quand le véhicule change.
 */
export function useVehicleFleetHistory(vehicleName: string) {
    const [state, setState] = useState<{ name: string; history: VehicleFleetHistory | null; refused: boolean; error: string | null }>(
        { name: vehicleName, history: null, refused: false, error: null },
    );
    // Véhicule changé : on repart d'un état vide (pendant le rendu, sans effet en cascade).
    if (state.name !== vehicleName) setState({ name: vehicleName, history: null, refused: false, error: null });

    useEffect(() => {
        let cancelled = false;
        const done = (patch: Partial<typeof state>) => {
            if (!cancelled) setState(prev => (prev.name === vehicleName ? { ...prev, ...patch } : prev));
        };
        (async () => {
            try {
                const res = await fetch(`/api/fleet-tracking/vehicles/${encodeURIComponent(vehicleName)}/history`, { cache: 'no-store' });
                if (res.status === 403 || res.status === 404) return done({ refused: true });
                if (!res.ok) return done({ error: await readError(res, 'Chargement du suivi technique impossible.') });
                const data = await res.json() as VehicleFleetHistory;
                done({ history: { vehicle: data.vehicle, entries: Array.isArray(data.entries) ? data.entries : [] } });
            } catch (e: unknown) {
                console.error('Chargement du suivi technique du véhicule :', e);
                done({ error: 'Chargement du suivi technique impossible.' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [vehicleName]);

    return { history: state.history, refused: state.refused, error: state.error };
}
