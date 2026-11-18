'use client';

import ContactsTab from './ContactsTab';
import { FLEET_TRACKING_TABS, FLEET_TRACKING_TAB_LABELS, type FleetTrackingTab } from './tabs';

interface Props {
    tab: FleetTrackingTab;
    onSelectTab: (tab: FleetTrackingTab) => void;
    ulName?: string;
}

/** Vue « Suivi technique » de `/vehicles` : sous-onglets et contenu de l'onglet actif. */
export default function FleetTrackingPanel({ tab, onSelectTab, ulName }: Props) {
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
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`fleet-panel-${tab}`} aria-labelledby={`fleet-tab-${tab}`}>
                {tab === 'contacts' && <ContactsTab ulName={ulName} />}
            </div>
        </section>
    );
}
