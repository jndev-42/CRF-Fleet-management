'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_FLEET_TRACKING_TAB, FLEET_TRACKING_TABS, type FleetTrackingTab } from '@/components/fleetTracking/tabs';

/**
 * Bascule « Flotte / Suivi technique » de `/vehicles`, portée par l'URL
 * (`?vue=suivi&onglet=taches&tache=<id>`) : un lien copié ou une notification rouvre
 * le même onglet, et la même tâche. `canUse` faux (rôle insuffisant, Vue DT) : la
 * vue suivi est ignorée.
 */
export function useFleetTrackingView(canUse: boolean) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const isTracking = canUse && searchParams.get('vue') === 'suivi';
    const rawTab = searchParams.get('onglet');
    const tab: FleetTrackingTab = (FLEET_TRACKING_TABS as readonly string[]).includes(rawTab ?? '')
        ? rawTab as FleetTrackingTab
        : DEFAULT_FLEET_TRACKING_TAB;
    const taskId = isTracking && tab === 'taches' ? searchParams.get('tache') || null : null;

    const write = useCallback((next: { tracking: boolean; tab?: FleetTrackingTab; taskId?: string | null }) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('vue');
        params.delete('onglet');
        params.delete('tache');
        if (next.tracking) {
            params.set('vue', 'suivi');
            params.set('onglet', next.tab ?? DEFAULT_FLEET_TRACKING_TAB);
            if (next.taskId && (next.tab ?? DEFAULT_FLEET_TRACKING_TAB) === 'taches') params.set('tache', next.taskId);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const setTracking = useCallback((on: boolean) => write({ tracking: on, tab }), [write, tab]);
    const setTab = useCallback((next: FleetTrackingTab) => write({ tracking: true, tab: next }), [write]);
    /** Ouvre (id) ou ferme (`null`) la modale d'une tâche, dans l'URL. */
    const setTaskId = useCallback((id: string | null) => write({ tracking: true, tab: 'taches', taskId: id }), [write]);

    return { isTracking, tab, setTracking, setTab, taskId, setTaskId };
}
