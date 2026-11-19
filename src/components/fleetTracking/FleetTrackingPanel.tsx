'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ContactsTab from './ContactsTab';
import ControlsTab from './ControlsTab';
import DossiersTab from './DossiersTab';
import OverviewTab from './OverviewTab';
import TasksTab from './TasksTab';
import { FLEET_TRACKING_TABS, FLEET_TRACKING_TAB_LABELS, type FleetTabFilter, type FleetTrackingTab } from './tabs';
import { useFleetOverview } from './useFleetOverview';
import styles from './dossiers.module.css';

interface Props {
    tab: FleetTrackingTab;
    /** Change d'onglet, avec éventuellement un filtre d'ouverture (cartes de la vue d'ensemble). */
    onSelectTab: (tab: FleetTrackingTab, filter?: FleetTabFilter) => void;
    /** Filtre d'ouverture de l'onglet actif (`?filtre=`, `?vehicule=`). */
    tabFilter?: FleetTabFilter;
    /** Retire le filtre d'ouverture de l'URL (premier changement de filtre dans l'onglet). */
    onClearTabFilter?: () => void;
    ulName?: string;
    /** Tâche ouverte en modale (`?tache=`), ou `null`. */
    taskId?: string | null;
    onOpenTask?: (taskId: string | null) => void;
    /** Dossier affiché en détail (`?dossier=`), ou `null` : liste. */
    dossierId?: string | null;
    onOpenDossier?: (dossierId: string | null) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Vue « Suivi technique » de `/vehicles` : sous-onglets (avec badges) et contenu de l'onglet actif. */
export default function FleetTrackingPanel({
    tab, onSelectTab, tabFilter, onClearTabFilter, ulName, taskId = null, onOpenTask, dossierId = null, onOpenDossier,
}: Props) {
    // Relit la vue d'ensemble (badges des sous-onglets compris) après une modification dans un onglet.
    const [changeVersion, setChangeVersion] = useState(0);
    const overviewState = useFleetOverview(changeVersion);
    const bumpVersion = useCallback(() => setChangeVersion(v => v + 1), []);
    // Téléphone : la barre d'onglets défile horizontalement ; l'onglet actif reste visible.
    const tabBarRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const bar = tabBarRef.current;
        const active = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
        bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    }, [tab]);
    const tabCounts = overviewState.overview?.tabCounts;
    const badge = (t: FleetTrackingTab): { count: number; label: string } | null => {
        if (!tabCounts) return null;
        if (t === 'taches' && tabCounts.tasks > 0) return { count: tabCounts.tasks, label: plural(tabCounts.tasks, 'non terminée', 'non terminées') };
        if (t === 'dossiers' && tabCounts.dossiers > 0) return { count: tabCounts.dossiers, label: plural(tabCounts.dossiers, 'ouvert', 'ouverts') };
        return null;
    };

    return (
        <section aria-label="Suivi technique">
            <div ref={tabBarRef} className={`tab-bar ${styles.tabBar}`} role="tablist" aria-label="Sections du suivi technique">
                {FLEET_TRACKING_TABS.map(t => {
                    const b = badge(t);
                    return (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            id={`fleet-tab-${t}`}
                            aria-selected={tab === t}
                            aria-controls={`fleet-panel-${t}`}
                            className={`tab-btn${tab === t ? ' active' : ''}`}
                            onClick={() => onSelectTab(t)}
                        >
                            {FLEET_TRACKING_TAB_LABELS[t]}
                            {b && <span className={styles.tabBadge} aria-label={b.label}>{b.count}</span>}
                        </button>
                    );
                })}
            </div>
            <div role="tabpanel" id={`fleet-panel-${tab}`} aria-labelledby={`fleet-tab-${tab}`} className={styles.tabPanel}>
                {tab === 'ensemble' && (
                    <OverviewTab
                        overview={overviewState.overview}
                        loading={overviewState.loading}
                        error={overviewState.error}
                        onChanged={bumpVersion}
                        onNavigate={onSelectTab}
                        onOpenDossier={id => onOpenDossier?.(id)}
                        openTaskId={taskId}
                        onOpenTask={onOpenTask}
                    />
                )}
                {tab === 'taches' && (
                    <TasksTab
                        openTaskId={taskId}
                        onOpenTask={onOpenTask ?? (() => {})}
                        onChanged={bumpVersion}
                        initialFilter={tabFilter?.filter}
                        onFilterChanged={onClearTabFilter}
                    />
                )}
                {tab === 'dossiers' && (
                    <DossiersTab
                        openDossierId={dossierId}
                        onOpenDossier={onOpenDossier ?? (() => {})}
                        onChanged={bumpVersion}
                        initialFilter={tabFilter}
                        onFilterChanged={onClearTabFilter}
                    />
                )}
                {tab === 'controles' && (
                    <ControlsTab onChanged={bumpVersion} initialFilter={tabFilter?.filter} onFilterChanged={onClearTabFilter} />
                )}
                {tab === 'contacts' && <ContactsTab ulName={ulName} />}
            </div>
        </section>
    );
}
