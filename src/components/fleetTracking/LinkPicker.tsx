'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Car, Phone, Tag, Wrench, X } from 'lucide-react';
import { cleanPhoneNumber } from '@/lib/fleetTracking/contacts';
import { LINK_TYPES, LINK_TYPE_LABELS, type LinkTarget, type LinkType, type TaskLink } from '@/lib/fleetTracking/tasks';
import { readError } from './useFleetContacts';
import styles from './tasks.module.css';

interface Props {
    value: TaskLink[];
    onChange: (next: TaskLink[]) => void;
}

const ICONS: Record<LinkType, typeof Car> = { VEHICLE: Car, CONTACT: Tag, INCIDENT: AlertTriangle, MAINTENANCE: Wrench };
const GROUP_LABELS: Record<LinkType, string> = { VEHICLE: 'Véhicules', CONTACT: 'Contacts', INCIDENT: 'Incidents', MAINTENANCE: 'Maintenances' };

/** Lien vers l'objet rattaché, quand il a une page : fiche du véhicule (aussi pour un incident ou une maintenance). */
function hrefOf(link: TaskLink): string | null {
    if (link.missing || !link.vehicleName) return null;
    return `/vehicles/${encodeURIComponent(link.vehicleName)}`;
}

/**
 * Rattachements d'une tâche : puces (véhicule, contact appelable, incident,
 * maintenance) et un champ unique de recherche, résultats groupés par type.
 */
export default function LinkPicker({ value, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LinkTarget[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        return () => document.removeEventListener('mousedown', onPointer);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/fleet-tracking/link-targets?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
                if (cancelled) return;
                if (!res.ok) {
                    setResults([]);
                    setError(await readError(res, 'Recherche impossible'));
                    return;
                }
                setResults((await res.json() as { targets: LinkTarget[] }).targets);
                setError(null);
            } catch (e: unknown) {
                console.error('Recherche de rattachements :', e);
                if (!cancelled) {
                    setResults([]);
                    setError('Recherche impossible');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [open, query]);

    const chosen = new Set(value.map(l => `${l.type}:${l.id}`));
    const available = results.filter(r => !chosen.has(`${r.type}:${r.id}`));

    const add = (t: LinkTarget) => {
        onChange([...value, { ...t, phone: null, vehicleName: t.type === 'VEHICLE' ? t.label : null, missing: false }]);
        setQuery('');
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={styles.picker}>
            <div className={styles.chips}>
                {value.map(link => {
                    const Icon = ICONS[link.type];
                    const href = hrefOf(link);
                    return (
                        <span key={`${link.type}:${link.id}`} className={`${styles.chip} ${styles[`pill_${link.type}`]}`}>
                            <Icon size={14} aria-hidden="true" />
                            {href ? <Link href={href} className={styles.chipLink}>{link.label}</Link> : link.label}
                            {link.detail && link.type !== 'VEHICLE' && <span className={styles.dropdownMeta}>{link.detail}</span>}
                            {link.phone && (
                                <a href={`tel:${cleanPhoneNumber(link.phone)}`} className={styles.chipLink} aria-label={`Appeler ${link.label}`}>
                                    <Phone size={14} aria-hidden="true" />
                                </a>
                            )}
                            <button type="button" className={styles.chipRemove} aria-label={`Retirer ${link.label}`} onClick={() => onChange(value.filter(l => l !== link))}>
                                <X size={14} aria-hidden="true" />
                            </button>
                        </span>
                    );
                })}
                <label className={styles.pickerInput}>
                    <input
                        type="text"
                        role="combobox"
                        aria-expanded={open}
                        aria-controls="link-options"
                        aria-label="Ajouter un rattachement"
                        placeholder="+ Véhicule · contact · incident · maintenance"
                        value={query}
                        onFocus={() => setOpen(true)}
                        onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    />
                </label>
            </div>
            {open && (
                <div id="link-options" role="listbox" aria-label="Objets rattachables" className={styles.dropdown}>
                    {error ? (
                        <p role="alert" className={styles.error}>{error}</p>
                    ) : available.length === 0 ? (
                        <p className={styles.dropdownEmpty}>{loading ? 'Recherche…' : 'Aucun résultat'}</p>
                    ) : LINK_TYPES.map(type => {
                        const group = available.filter(r => r.type === type);
                        if (group.length === 0) return null;
                        return (
                            <div key={type} role="group" aria-label={GROUP_LABELS[type]}>
                                <p className={styles.dropdownHeader}>{GROUP_LABELS[type]}</p>
                                {group.map(t => {
                                    const Icon = ICONS[t.type];
                                    return (
                                        <button key={t.id} type="button" role="option" aria-selected={false} className={styles.dropdownItem} onClick={() => add(t)}>
                                            <Icon size={14} aria-hidden="true" /> {t.label}
                                            {t.detail && <span className={styles.dropdownMeta}>{t.detail}</span>}
                                            <span className={styles.srOnly}> ({LINK_TYPE_LABELS[t.type]})</span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
