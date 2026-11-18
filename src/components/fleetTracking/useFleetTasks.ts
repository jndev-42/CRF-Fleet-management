'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssignableManager, FleetTask, LinkTarget, TaskPriority, TaskStatus } from '@/lib/fleetTracking/tasks';
import { readError } from './useFleetContacts';

export const TASKS_URL = '/api/fleet-tracking/tasks';

export interface TaskFilterState {
    q: string;
    vehicle: string;
    /** `''` tout le monde, `'me'`, ou un identifiant. */
    assignee: string;
    pinned: boolean;
    priority: '' | TaskPriority;
}

export const EMPTY_TASK_FILTERS: TaskFilterState = { q: '', vehicle: '', assignee: '', pinned: false, priority: '' };

/** Chaîne de requête des filtres (valeurs vides omises). */
export function taskFiltersQuery(f: TaskFilterState): string {
    const params = new URLSearchParams();
    if (f.q.trim()) params.set('q', f.q.trim());
    if (f.vehicle) params.set('vehicle', f.vehicle);
    if (f.assignee) params.set('assignee', f.assignee);
    if (f.pinned) params.set('pinned', '1');
    if (f.priority) params.set('priority', f.priority);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

/**
 * Tâches de l'UL selon les filtres (recherche différée de 250 ms), et changement
 * d'état optimiste : la carte change de colonne aussitôt, et revient à sa colonne
 * d'origine avec un message si l'enregistrement échoue. Pendant son PATCH, une tâche
 * figure dans `pendingIds`, et toute lecture de la liste déjà partie est ignorée
 * (elle ramènerait la carte à son ancien état).
 */
export function useFleetTasks(filters: TaskFilterState) {
    const [tasks, setTasks] = useState<FleetTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const query = taskFiltersQuery(filters);
    const [debouncedQuery, setDebouncedQuery] = useState(query);
    const requestSeq = useRef(0);
    // Tâches dont le changement d'état est en cours : pastille et glisser désactivés.
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
    // Miroir synchrone : deux déplacements dans le même rendu ne lancent pas deux PATCH.
    const pendingRef = useRef(new Set<string>());

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 250);
        return () => clearTimeout(timer);
    }, [query]);

    // Lecture de la liste en cours (son numéro), 0 sinon.
    const inFlightSeq = useRef(0);
    const refetch = useCallback(async () => {
        const seq = ++requestSeq.current;
        inFlightSeq.current = seq;
        try {
            const res = await fetch(`${TASKS_URL}${debouncedQuery}`, { cache: 'no-store' });
            if (seq !== requestSeq.current) return;
            if (!res.ok) {
                setError(await readError(res, 'Chargement des tâches impossible'));
                return;
            }
            const data = await res.json() as { tasks: FleetTask[] };
            if (seq !== requestSeq.current) return;
            setTasks(data.tasks);
            setError(null);
        } catch (e: unknown) {
            console.error('Chargement des tâches :', e);
            if (seq === requestSeq.current) setError('Chargement des tâches impossible');
        } finally {
            if (inFlightSeq.current === seq) inFlightSeq.current = 0;
            if (seq === requestSeq.current) setLoading(false);
        }
    }, [debouncedQuery]);
    const refetchRef = useRef(refetch);
    useEffect(() => {
        refetchRef.current = refetch;
        void refetch();
    }, [refetch]);

    /** Change l'état d'une tâche ; renvoie le message d'erreur éventuel. */
    const moveTask = useCallback(async (task: FleetTask, status: TaskStatus): Promise<string | null> => {
        if (task.status === status || pendingRef.current.has(task.id)) return null;
        const setPending = (on: boolean) => {
            if (on) pendingRef.current.add(task.id); else pendingRef.current.delete(task.id);
            setPendingIds(prev => {
                const copy = new Set(prev);
                if (on) copy.add(task.id); else copy.delete(task.id);
                return copy;
            });
        };
        setPending(true);
        // Une lecture de la liste partie avant ce déplacement ne doit plus s'appliquer :
        // elle est ignorée, puis relancée une fois le déplacement enregistré.
        const invalidated = inFlightSeq.current !== 0;
        requestSeq.current++;
        inFlightSeq.current = 0;
        const previous = task.status;
        const now = new Date().toISOString();
        setTasks(list => list.map(t => (t.id === task.id
            ? { ...t, status, completedAt: status === 'DONE' ? now : null }
            : t)));
        try {
            const res = await fetch(`${TASKS_URL}/${encodeURIComponent(task.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (res.ok) {
                const data = await res.json() as { task?: FleetTask };
                if (data.task) setTasks(list => list.map(t => (t.id === task.id ? { ...t, ...data.task } : t)));
                return null;
            }
            const message = await readError(res, 'Changement d’état impossible');
            setTasks(list => list.map(t => (t.id === task.id ? { ...t, status: previous, completedAt: task.completedAt } : t)));
            return message;
        } catch {
            setTasks(list => list.map(t => (t.id === task.id ? { ...t, status: previous, completedAt: task.completedAt } : t)));
            return 'Changement d’état impossible';
        } finally {
            setPending(false);
            if (invalidated) void refetchRef.current();
        }
    }, []);

    return { tasks, loading, error, refetch, moveTask, pendingIds };
}

/** Responsables assignables et véhicules de l'UL (filtres et sélecteurs), chargés une fois. */
export function useTaskOptions() {
    const [assignees, setAssignees] = useState<AssignableManager[]>([]);
    const [vehicles, setVehicles] = useState<LinkTarget[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [aRes, vRes] = await Promise.all([
                    fetch('/api/fleet-tracking/assignees', { cache: 'no-store' }),
                    fetch('/api/fleet-tracking/link-targets?type=VEHICLE', { cache: 'no-store' }),
                ]);
                if (cancelled) return;
                if (aRes.ok) setAssignees((await aRes.json() as { assignees: AssignableManager[] }).assignees);
                if (vRes.ok) setVehicles((await vRes.json() as { targets: LinkTarget[] }).targets);
            } catch (e: unknown) {
                console.error('Chargement des options de tâche :', e);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    return { assignees, vehicles };
}
