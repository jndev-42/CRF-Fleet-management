'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetTask, TaskStatus } from '@/lib/fleetTracking/tasks';
import { TASKS_URL } from './useFleetTasks';
import { readError } from './useFleetContacts';

/** Durée d'affichage du message « Annuler » après avoir coché une tâche (hors pause). */
export const UNDO_DELAY_MS = 5000;

export const UNDO_FAILED_MESSAGE = 'Impossible d’annuler : la tâche reste terminée.';

export interface UndoToast {
    taskId: string;
    title: string;
    /** État d'avant la coche, rétabli par « Annuler ». */
    previous: TaskStatus;
}

async function patchStatus(taskId: string, status: TaskStatus): Promise<string | null> {
    try {
        const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        return res.ok ? null : await readError(res, 'Changement d’état impossible');
    } catch {
        return 'Changement d’état impossible';
    }
}

/**
 * Cocher une tâche des prochaines actions : elle passe à Terminé (masquée aussitôt),
 * puis un message « Annuler » reste affiché `UNDO_DELAY_MS` ; « Annuler » la rétablit
 * dans son état précédent. Le décompte s'interrompt (`pause`) tant que le message est
 * survolé ou a le focus, et reprend (`resume`) avec le temps restant. `onChanged` relit
 * la vue d'ensemble après chaque écriture.
 */
export function useCompleteWithUndo(onChanged: () => void) {
    const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
    const [toast, setToast] = useState<UndoToast | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Temps restant avant de masquer le message, et instant de (re)lancement du décompte.
    const remaining = useRef(UNDO_DELAY_MS);
    const startedAt = useRef(0);

    const clearTimer = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    }, []);
    const startTimer = useCallback((ms: number) => {
        clearTimer();
        remaining.current = ms;
        startedAt.current = Date.now();
        timer.current = setTimeout(() => {
            timer.current = null;
            setToast(null);
        }, ms);
    }, [clearTimer]);
    useEffect(() => clearTimer, [clearTimer]);

    const pause = useCallback(() => {
        if (!timer.current) return;
        clearTimer();
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    }, [clearTimer]);
    const resume = useCallback(() => {
        if (timer.current || remaining.current <= 0) return;
        startTimer(remaining.current);
    }, [startTimer]);

    const setHidden = (id: string, on: boolean) => setHiddenIds(prev => {
        const copy = new Set(prev);
        if (on) copy.add(id); else copy.delete(id);
        return copy;
    });

    const complete = useCallback(async (task: FleetTask) => {
        if (task.status === 'DONE') return;
        setError(null);
        setHidden(task.id, true);
        const message = await patchStatus(task.id, 'DONE');
        if (message) {
            setHidden(task.id, false);
            setError(message);
            return;
        }
        setToast({ taskId: task.id, title: task.title, previous: task.status });
        startTimer(UNDO_DELAY_MS);
        onChanged();
    }, [onChanged, startTimer]);

    const undo = useCallback(async () => {
        if (!toast) return;
        clearTimer();
        setToast(null);
        const message = await patchStatus(toast.taskId, toast.previous);
        setHidden(toast.taskId, false);
        if (message) {
            setError(UNDO_FAILED_MESSAGE);
            return;
        }
        onChanged();
    }, [toast, onChanged, clearTimer]);

    return { hiddenIds, toast, error, complete, undo, pause, resume };
}
