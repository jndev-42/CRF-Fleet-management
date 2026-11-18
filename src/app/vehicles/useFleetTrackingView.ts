'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FLEET_TRACKING_TABS, type FleetTrackingTab } from '@/components/fleetTracking/tabs';

const DEFAULT_TAB: FleetTrackingTab = 'contacts';

/**
 * Bascule « Flotte / Suivi technique » de `/vehicles`, portée par l'URL
 * (`?vue=suivi&onglet=contacts`) : un lien copié rouvre le même onglet.
 * `canUse` faux (rôle insuffisant, Vue DT) : la vue suivi est ignorée.
 */
export function useFleetTrackingView(canUse: boolean) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const isTracking = canUse && searchParams.get('vue') === 'suivi';
    const rawTab = searchParams.get('onglet');
    const tab: FleetTrackingTab = (FLEET_TRACKING_TABS as readonly string[]).includes(rawTab ?? '')
        ? rawTab as FleetTrackingTab
        : DEFAULT_TAB;

    const write = useCallback((next: { tracking: boolean; tab?: FleetTrackingTab }) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('vue');
        params.delete('onglet');
        if (next.tracking) {
            params.set('vue', 'suivi');
            params.set('onglet', next.tab ?? DEFAULT_TAB);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const setTracking = useCallback((on: boolean) => write({ tracking: on, tab }), [write, tab]);
    const setTab = useCallback((next: FleetTrackingTab) => write({ tracking: true, tab: next }), [write]);

    return { isTracking, tab, setTracking, setTab };
}
