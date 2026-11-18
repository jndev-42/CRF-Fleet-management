'use client';

import { useState } from 'react';
import ContactsTab from './ContactsTab';
import DossiersTab from './DossiersTab';
import TasksTab from './TasksTab';
import { FLEET_TRACKING_TABS, FLEET_TRACKING_TAB_LABELS, type FleetTrackingTab } from './tabs';
import { useOpenDossierCount } from './useFleetDossiers';
import styles from './dossiers.module.css';

interface Props {
    tab: FleetTrackingTab;
    onSelectTab: (tab: FleetTrackingTab) => void;
    ulName?: string;
    /** Tâche ouverte en modale (`?tache=`), ou `null`. */
    taskId?: string | null;
    onOpenTask?: (taskId: string | null) => void;
    /** Dossier affiché en détail (`?dossier=`), ou `null` : liste. */
    dossierId?: string | null;
    onOpenDossier?: (dossierId: string | null) => void;
}

/** Vue « Suivi technique » de `/vehicles` : sous-onglets et contenu de l'onglet actif. */
export default function FleetTrackingPanel({ tab, onSelectTab, ulName, taskId = null, onOpenTask, dossierId = null, onOpenDossier }: Props) {
    // Relit le badge « Dossiers » après une modification de dossier.
    const [dossierVersion, setDossierVersion] = useState(0);
    const openDossiers = useOpenDossierCount(dossierVersion);

    return (
        <section aria-label="Suivi technique">
            <div className="tab-bar" role="tablist" aria-label="Sections du suivi technique">
                {FLEET_TRACKING_TABS.map(t => (
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
                        {t === 'dossiers' && !!openDossiers && (
                            <span className={styles.tabBadge} aria-label={`${openDossiers} ouvert${openDossiers > 1 ? 's' : ''}`}>{openDossiers}</span>
                        )}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`fleet-panel-${tab}`} aria-labelledby={`fleet-tab-${tab}`}>
                {tab === 'taches' && <TasksTab openTaskId={taskId} onOpenTask={onOpenTask ?? (() => {})} />}
                {tab === 'dossiers' && (
                    <DossiersTab
                        openDossierId={dossierId}
                        onOpenDossier={onOpenDossier ?? (() => {})}
                        onChanged={() => setDossierVersion(v => v + 1)}
                    />
                )}
                {tab === 'contacts' && <ContactsTab ulName={ulName} />}
            </div>
        </section>
    );
}
