'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { initialsOf, type AssignableManager, type TaskAssignee } from '@/lib/fleetTracking/tasks';
import styles from './tasks.module.css';

interface Props {
    /** Responsables assignables de l'UL (seuls proposés). */
    options: AssignableManager[];
    value: TaskAssignee[];
    onChange: (next: TaskAssignee[]) => void;
    currentUserId?: string | null;
}

function normalize(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Sélecteur multiple d'assignés : puces retirables et recherche parmi les
 * responsables véhicule et admins actifs de l'UL.
 */
export default function AssigneePicker({ options, value, onChange, currentUserId }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        return () => document.removeEventListener('mousedown', onPointer);
    }, [open]);

    const selected = new Set(value.map(v => v.id));
    const q = normalize(query.trim());
    const candidates = options
        .filter(o => !selected.has(o.id))
        .filter(o => !q || normalize(`${o.name} ${o.email}`).includes(q));
    const label = (a: { id: string; name: string }) => (a.id === currentUserId ? `${a.name} (moi)` : a.name);

    const add = (o: AssignableManager) => {
        onChange([...value, { id: o.id, name: o.name }]);
        setQuery('');
    };

    return (
        <div ref={rootRef} className={styles.picker}>
            <div className={styles.chips}>
                {value.map(a => (
                    <span key={a.id} className={styles.chip}>
                        <span className={styles.avatar} aria-hidden="true">{initialsOf(a.name)}</span>
                        {label(a)}
                        <button type="button" className={styles.chipRemove} aria-label={`Retirer ${a.name}`} onClick={() => onChange(value.filter(v => v.id !== a.id))}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <label className={styles.pickerInput}>
                    <Search size={14} aria-hidden="true" />
                    <input
                        type="text"
                        role="combobox"
                        aria-expanded={open}
                        aria-controls="assignee-options"
                        aria-label="Ajouter un assigné"
                        placeholder="+ Ajouter"
                        value={query}
                        onFocus={() => setOpen(true)}
                        onChange={e => { setQuery(e.target.value); setOpen(true); }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (candidates[0]) add(candidates[0]);
                            }
                        }}
                    />
                </label>
            </div>
            {open && (
                <div id="assignee-options" role="listbox" aria-label="Responsables véhicule et admins de l'UL" className={styles.dropdown}>
                    <p className={styles.dropdownHeader}>Responsables véhicule et admins de l&apos;UL</p>
                    {candidates.length === 0 ? (
                        <p className={styles.dropdownEmpty}>{options.length === 0 ? 'Aucun responsable disponible' : 'Aucun autre responsable'}</p>
                    ) : candidates.map(o => (
                        <button key={o.id} type="button" role="option" aria-selected={false} className={styles.dropdownItem} onClick={() => add(o)}>
                            <span className={styles.avatar} aria-hidden="true">{initialsOf(o.name)}</span>
                            {label(o)}
                            <span className={styles.dropdownMeta}>{o.roleLabel}</span>
                        </button>
                    ))}
                </div>
            )}
            <p className={styles.hint}>Les personnes ajoutées par quelqu&apos;un d&apos;autre reçoivent une notification.</p>
        </div>
    );
}
