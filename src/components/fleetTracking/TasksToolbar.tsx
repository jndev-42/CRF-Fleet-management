'use client';

import { Columns3, List, Pin, Plus, Search } from 'lucide-react';
import type { AssignableManager, LinkTarget } from '@/lib/fleetTracking/tasks';
import type { TaskFilterState } from './useFleetTasks';
import styles from './tasks.module.css';

export type TasksView = 'board' | 'list';

interface Props {
    filters: TaskFilterState;
    onChange: (next: TaskFilterState) => void;
    vehicles: LinkTarget[];
    assignees: AssignableManager[];
    view: TasksView;
    onViewChange: (view: TasksView) => void;
    onCreate: () => void;
}

/** Barre d'outils de l'onglet Tâches : recherche, filtres, bascule Tableau/Liste, « + Tâche ». */
export default function TasksToolbar({ filters, onChange, vehicles, assignees, view, onViewChange, onCreate }: Props) {
    const set = (patch: Partial<TaskFilterState>) => onChange({ ...filters, ...patch });
    return (
        <div className={styles.toolbar}>
            <label className={styles.search}>
                <Search size={16} aria-hidden="true" />
                <input
                    type="search"
                    className="form-input"
                    placeholder="Rechercher une tâche…"
                    value={filters.q}
                    onChange={e => set({ q: e.target.value })}
                    aria-label="Rechercher une tâche"
                />
            </label>
            <select className="form-select" aria-label="Filtrer par véhicule" value={filters.vehicle} onChange={e => set({ vehicle: e.target.value })}>
                <option value="">Tous les véhicules</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <select className="form-select" aria-label="Filtrer par assigné" value={filters.assignee} onChange={e => set({ assignee: e.target.value })}>
                <option value="">Tout le monde</option>
                <option value="me">Mes tâches</option>
                {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className={styles.filterGroup} role="group" aria-label="Filtres rapides">
                <button type="button" className={`filter-btn${filters.assignee === 'me' ? ' active' : ''}`} aria-pressed={filters.assignee === 'me'}
                    onClick={() => set({ assignee: filters.assignee === 'me' ? '' : 'me' })}>
                    Mes tâches
                </button>
                <button type="button" className={`filter-btn${filters.pinned ? ' active' : ''}`} aria-pressed={filters.pinned}
                    onClick={() => set({ pinned: !filters.pinned })}>
                    <Pin size={14} aria-hidden="true" /> Épinglées
                </button>
                <button type="button" className={`filter-btn${filters.priority === 'HIGH' ? ' active' : ''}`} aria-pressed={filters.priority === 'HIGH'}
                    onClick={() => set({ priority: filters.priority === 'HIGH' ? '' : 'HIGH' })}>
                    Prioritaires
                </button>
                <button type="button" className={`filter-btn${filters.due ? ' active' : ''}`} aria-pressed={filters.due}
                    onClick={() => set({ due: !filters.due })}>
                    Échéances à traiter
                </button>
            </div>
            <div className={styles.toolbarEnd}>
                <div className={styles.segmented} role="group" aria-label="Affichage">
                    <button type="button" className={`btn ${view === 'board' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === 'board'} onClick={() => onViewChange('board')}>
                        <Columns3 size={16} aria-hidden="true" /> Tableau
                    </button>
                    <button type="button" className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>
                        <List size={16} aria-hidden="true" /> Liste
                    </button>
                </div>
                <button type="button" className="btn btn-primary" onClick={onCreate}>
                    <Plus size={16} aria-hidden="true" /> Tâche
                </button>
            </div>
        </div>
    );
}
