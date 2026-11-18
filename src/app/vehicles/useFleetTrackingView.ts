'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_FLEET_TRACKING_TAB, FLEET_TRACKING_TABS, type FleetTabFilter, type FleetTrackingTab } from '@/components/fleetTracking/tabs';

/**
 * Bascule « Flotte / Suivi technique » de `/vehicles`, portée par l'URL
 * (`?vue=suivi&onglet=taches&tache=<id>`, `?vue=suivi&onglet=dossiers&dossier=<id>`,
 * `?vue=suivi&onglet=controles&filtre=to_schedule`, `?vue=suivi&onglet=dossiers&vehicule=<id>`) :
 * un lien copié ou une notification rouvre le même onglet, et la même tâche ou le
 * même dossier. `canUse` faux (rôle insuffisant, Vue DT) : la
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
    // `tache` : modale de tâche, sur l'onglet Tâches ou sur la Vue d'ensemble.
    const taskId = isTracking && (tab === 'taches' || tab === 'ensemble') ? searchParams.get('tache') || null : null;
    const dossierId = isTracking && tab === 'dossiers' ? searchParams.get('dossier') || null : null;
    // Filtre d'ouverture de l'onglet (cartes de la vue d'ensemble) ; l'onglet le valide.
    const tabFilter: FleetTabFilter = {
        filter: isTracking ? searchParams.get('filtre') || null : null,
        vehicle: isTracking ? searchParams.get('vehicule') || null : null,
    };

    const write = useCallback((next: {
        tracking: boolean; tab?: FleetTrackingTab; taskId?: string | null; dossierId?: string | null; filter?: FleetTabFilter;
    }) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('vue');
        params.delete('onglet');
        params.delete('tache');
        params.delete('dossier');
        params.delete('filtre');
        params.delete('vehicule');
        if (next.tracking) {
            const nextTab = next.tab ?? DEFAULT_FLEET_TRACKING_TAB;
            params.set('vue', 'suivi');
            params.set('onglet', nextTab);
            if (next.taskId && (nextTab === 'taches' || nextTab === 'ensemble')) params.set('tache', next.taskId);
            if (next.dossierId && nextTab === 'dossiers') params.set('dossier', next.dossierId);
            if (next.filter?.filter) params.set('filtre', next.filter.filter);
            if (next.filter?.vehicle) params.set('vehicule', next.filter.vehicle);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const setTracking = useCallback((on: boolean) => write({ tracking: on, tab }), [write, tab]);
    /** Change d'onglet, avec éventuellement un filtre d'ouverture (`filtre`, `vehicule`). */
    const setTab = useCallback((next: FleetTrackingTab, filter?: FleetTabFilter) => write({ tracking: true, tab: next, filter }), [write]);
    /**
     * Ouvre (id) ou ferme (`null`) la modale d'une tâche, dans l'URL : sur la Vue
     * d'ensemble si elle est active, sinon sur l'onglet Tâches.
     */
    const setTaskId = useCallback(
        (id: string | null) => write({ tracking: true, tab: tab === 'ensemble' ? 'ensemble' : 'taches', taskId: id }),
        [write, tab],
    );
    /**
     * Retire le filtre d'ouverture (`filtre`, `vehicule`) de l'URL — au premier changement
     * de filtre fait dans l'onglet. Sans effet s'il n'y en a pas.
     */
    const clearTabFilter = useCallback(() => {
        if (!searchParams.has('filtre') && !searchParams.has('vehicule')) return;
        const params = new URLSearchParams(searchParams.toString());
        params.delete('filtre');
        params.delete('vehicule');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);
    /** Ouvre (id) ou referme (`null`, retour à la liste) un dossier, dans l'URL. */
    const setDossierId = useCallback((id: string | null) => write({ tracking: true, tab: 'dossiers', dossierId: id }), [write]);

    return { isTracking, tab, tabFilter, clearTabFilter, setTracking, setTab, taskId, setTaskId, dossierId, setDossierId };
}
