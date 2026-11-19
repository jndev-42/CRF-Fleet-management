'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '@/lib/fleetTracking/tasks';
import styles from './tasks.module.css';

interface Props {
    status: TaskStatus;
    taskTitle: string;
    onChange: (status: TaskStatus) => void;
    disabled?: boolean;
}

/**
 * Pastille d'état d'une carte : ouvre un menu « Déplacer vers… » (feuille en bas
 * d'écran sur téléphone). Alternative non gestuelle au glisser-déposer.
 * Clavier : flèches haut/bas, Début/Fin, Échap ; le focus revient à la pastille.
 */
export default function TaskStatusPill({ status, taskTitle, onChange, disabled = false }: Props) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = (returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) pillRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
        return () => document.removeEventListener('mousedown', onPointer);
    }, [open]);

    const choose = (next: TaskStatus) => {
        close(true);
        if (next !== status) onChange(next);
    };

    const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        let next: number | null = null;
        if (e.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        else if (e.key === 'Escape' || e.key === 'Tab') {
            // Échap ne ferme que le menu (pas une modale englobante).
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
            }
            close(e.key === 'Escape');
            return;
        }
        if (next === null) return;
        e.preventDefault();
        items[next]?.focus();
    };

    return (
        <div ref={rootRef} className={styles.statusRoot} onClick={e => e.stopPropagation()}>
            <button
                ref={pillRef}
                type="button"
                className={`${styles.statusPill} ${styles[`state_${status}`]}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`État : ${TASK_STATUS_LABELS[status]}. Déplacer la tâche`}
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                onKeyDown={e => {
                    if (e.key === 'ArrowDown' && !open) {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span className={styles.dot} aria-hidden="true" />
                {TASK_STATUS_LABELS[status]}
                <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && (
                <>
                    <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => close(true)} />
                    <div ref={menuRef} className={styles.statusMenu} role="menu" aria-label={`Déplacer « ${taskTitle} » vers…`} onKeyDown={onMenuKeyDown}>
                        <p className={styles.menuTitle}>{taskTitle}</p>
                        <p className={styles.menuHint}>Déplacer vers…</p>
                        {TASK_STATUSES.map(s => (
                            <button
                                key={s}
                                type="button"
                                role="menuitemradio"
                                aria-checked={s === status}
                                tabIndex={s === status ? 0 : -1}
                                className={`${styles.menuItem} ${styles[`state_${s}`]}`}
                                onClick={() => choose(s)}
                            >
                                <span className={styles.dot} aria-hidden="true" />
                                {TASK_STATUS_LABELS[s]}
                                {s === status && <Check size={16} aria-hidden="true" className={styles.menuCheck} />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
