'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenaultVehicleData } from '@/lib/renault';
import type { DashboardVehicle } from './types';
import type { DtFetchWindow } from './useDtFilters';

/**
 * Liste des véhicules du dashboard (Vue UL ou Vue DT) + télémétrie Renault en direct.
 *
 * En Vue DT, la fenêtre de disponibilité part dans `from` / `to` ; une fenêtre `'invalid'`
 * ne déclenche aucun appel. Une réponse arrivée après une requête plus récente est ignorée
 * (changements de période rapprochés).
 */
export function useFleetVehicles(opts: {
    enabled: boolean;
    isDtView: boolean;
    dtWindow: DtFetchWindow;
    /** Change à chaque changement d'UL active : recharge la flotte. */
    ulKey: string | undefined;
}) {
    const { enabled, isDtView, dtWindow, ulKey } = opts;
    const [vehicles, setVehicles] = useState<DashboardVehicle[]>([]);
    const [renaultData, setRenaultData] = useState<Record<string, RenaultVehicleData>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** Vue et UL des données affichées (`dt|<ulId>`) : distingue un premier chargement d'un recalcul. */
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const requestId = useRef(0);
    /** Véhicules dont la télémétrie est déjà chargée pour la vue et l'UL courantes. */
    const renaultFetched = useRef<{ key: string; names: Set<string> }>({ key: '', names: new Set() });
    const viewKey = `${isDtView ? 'dt' : 'ul'}|${ulKey}`;

    const windowFrom = dtWindow && dtWindow !== 'invalid' ? dtWindow.from : null;
    const windowTo = dtWindow && dtWindow !== 'invalid' ? dtWindow.to : null;
    const windowInvalid = dtWindow === 'invalid';

    const fetchVehicles = useCallback(async () => {
        if (isDtView && windowInvalid) {
            // Aucun calcul : on écarte une éventuelle réponse en vol et on ne reste pas « en chargement ».
            requestId.current++;
            setLoading(false);
            return;
        }
        const id = ++requestId.current;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (isDtView) {
                params.set('view', 'dt');
                if (windowFrom && windowTo) {
                    params.set('from', windowFrom);
                    params.set('to', windowTo);
                }
            }
            params.set('t', String(Date.now()));
            const res = await fetch(`/api/vehicles?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur lors de la récupération');
            if (id !== requestId.current) return;
            setVehicles(data);
            setLoadedKey(viewKey);

            // Fetch Renault data for supported vehicles — une seule fois par vue et par UL :
            // un changement de période ne relance pas la télémétrie.
            if (renaultFetched.current.key !== viewKey) renaultFetched.current = { key: viewKey, names: new Set() };
            const fetchedNames = renaultFetched.current.names;
            const renaultVehicles = data.filter((v: DashboardVehicle) => v.connection?.status === 'CONNECTED' && !fetchedNames.has(v.name));
            renaultVehicles.forEach((v: DashboardVehicle) => fetchedNames.add(v.name));
            if (renaultVehicles.length > 0) {
                Promise.all(renaultVehicles.map(async (v: DashboardVehicle) => {
                    // Plus de repli `|| v.name` : le nom n'a jamais été un VIN, il produisait un appel
                    // voué à l'échec. Sans VIN, il n'y a rien à demander à l'API Renault.
                    if (!v.vin) return;
                    try {
                        const rRes = await fetch(`/api/renault/${encodeURIComponent(v.vin)}`);
                        const rData = await rRes.json();
                        if (!rData.error) {
                            setRenaultData(prev => ({ ...prev, [v.name]: rData }));
                        }
                    } catch (e) {
                        console.error('Failed to get Renault data for', v.name, e);
                    }
                }));
            }
        } catch (e: unknown) {
            console.error('Erreur:', e);
            if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [isDtView, windowFrom, windowTo, windowInvalid, viewKey]);

    useEffect(() => {
        if (enabled) fetchVehicles();
    }, [enabled, fetchVehicles]);

    return {
        vehicles,
        renaultData,
        loading,
        error,
        /** Les données affichées sont celles de la Vue DT pour l'UL active (sinon : premier chargement). */
        hasDtData: loadedKey === `dt|${ulKey}`,
        refetch: fetchVehicles,
    };
}
