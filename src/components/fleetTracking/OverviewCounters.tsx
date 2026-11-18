'use client';

import type { OverviewCounters as Counters } from '@/lib/fleetTracking/overview';
import { DOSSIER_MISSING_FILTER, TASK_DUE_FILTER, type FleetTabFilter, type FleetTrackingTab } from './tabs';
import styles from './overview.module.css';

interface Props {
    counters: Counters;
    /** Ouvre l'onglet correspondant, filtre appliqué. */
    onNavigate: (tab: FleetTrackingTab, filter?: FleetTabFilter) => void;
}

type CounterKey = 'openDossiers' | 'dueSoon' | 'missingItems' | 'controlsToSchedule';

interface Card {
    key: CounterKey;
    label: string;
    sub: (c: Counters) => string;
    tone: 'total' | 'maintenance' | 'inuse' | 'available';
    /** Sans cible : la carte détaille ses parts, chacune cliquable (« Échéances à traiter »). */
    target?: [FleetTrackingTab, FleetTabFilter?];
    targetLabel?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const CARDS: Card[] = [
    {
        key: 'openDossiers', label: 'Dossiers ouverts', tone: 'total',
        sub: c => `Sur les ${c.vehicleCount} véhicule${c.vehicleCount > 1 ? 's' : ''}`,
        target: ['dossiers'], targetLabel: 'voir les dossiers ouverts',
    },
    {
        key: 'dueSoon', label: 'Échéances à traiter', tone: 'maintenance',
        sub: () => 'Actions et contrôles sous 30 jours',
    },
    {
        key: 'missingItems', label: 'Pièces à récupérer', tone: 'inuse',
        sub: () => 'Pour compléter les dossiers',
        target: ['dossiers', { filter: DOSSIER_MISSING_FILTER }], targetLabel: 'voir les dossiers ayant des pièces à récupérer',
    },
    {
        key: 'controlsToSchedule', label: 'Contrôles à dater', tone: 'available',
        sub: () => 'Échéances sans rendez-vous',
        target: ['controles', { filter: 'to_schedule' }], targetLabel: 'voir les contrôles à dater',
    },
];

/** Les quatre compteurs de la vue d'ensemble, chacun menant à la liste filtrée. */
export default function OverviewCounters({ counters, onNavigate }: Props) {
    return (
        <div className={`stats-grid ${styles.stats}`}>
            {CARDS.map(card => (card.target ? (
                <button
                    key={card.key}
                    type="button"
                    className={`stat-card ${card.tone} ${styles.statButton}`}
                    aria-label={`${card.label} : ${counters[card.key]} — ${card.targetLabel}`}
                    onClick={() => onNavigate(...card.target!)}
                >
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-value">{counters[card.key]}</div>
                    <div className={styles.statSub}>{card.sub(counters)}</div>
                </button>
            ) : (
                <div key={card.key} className={`stat-card ${card.tone}`} role="group" aria-label={`${card.label} : ${counters[card.key]}`}>
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-value">{counters[card.key]}</div>
                    <div className={styles.statSub}>
                        <button type="button" className={styles.statPart} onClick={() => onNavigate('taches', { filter: TASK_DUE_FILTER })}
                            aria-label={`${plural(counters.dueSoonTasks, 'tâche', 'tâches')} à échéance sous 30 jours — voir les tâches`}>
                            {plural(counters.dueSoonTasks, 'tâche', 'tâches')}
                        </button>
                        {' · '}
                        <button type="button" className={styles.statPart} onClick={() => onNavigate('controles', { filter: 'soon' })}
                            aria-label={`${plural(counters.dueSoonControls, 'contrôle', 'contrôles')} sous 30 jours — voir les contrôles`}>
                            {plural(counters.dueSoonControls, 'contrôle', 'contrôles')}
                        </button>
                    </div>
                </div>
            )))}
        </div>
    );
}
