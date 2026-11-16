'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import styles from './UserCombobox.module.css';
import { UNASSIGNED_DRIVER_NAME } from '@/lib/reservationDriver';

interface UserComboboxProps {
    /** `ulIds` : UL de rattachement de la personne — absent (ancienne réponse) = hors UL quand « Mon UL » est actif. */
    users: { id: string; name: string | null; email: string; ulIds?: string[] }[];
    value: string;
    onChange: (userId: string) => void;
    excludeEmail?: string;
    defaultLabel?: string;
    /** Masque l'entrée « défaut » (ex. « Moi-même ») ; le déclencheur affiche alors `emptyLabel` si rien n'est choisi. */
    hideDefault?: boolean;
    emptyLabel?: string;
    placeholder?: string;
    /** Id posé sur le déclencheur, pour relier un `<label htmlFor>`. */
    id?: string;
}

export default function UserCombobox({
    users,
    value,
    onChange,
    excludeEmail,
    defaultLabel = 'Moi-même',
    hideDefault = false,
    emptyLabel = 'Choisir un chauffeur',
    placeholder = 'Rechercher...',
    id,
}: UserComboboxProps) {
    const [userSearch, setUserSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [myUlOnly, setMyUlOnly] = useState(false);
    const { data: session } = useSession();
    const activeUlId = session?.user?.ulId;
    // Le sélecteur n'a de sens que si l'UL active est connue.
    const canFilterByUl = !!activeUlId && activeUlId !== 'default';
    const filterByUl = canFilterByUl && myUlOnly;
    const dropdownRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setUserSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDropdown]);

    const selectedUser = users.find(u => u.id === value);
    const triggerLabel = value === 'UNASSIGNED'
        ? UNASSIGNED_DRIVER_NAME
        : value
        ? (selectedUser?.name || selectedUser?.email || (hideDefault ? emptyLabel : defaultLabel))
        : hideDefault ? emptyLabel : defaultLabel;

    const filteredUsers = users.filter(u =>
        u.email !== excludeEmail &&
        (!filterByUl || (u.ulIds ?? []).includes(activeUlId as string)) &&
        (!userSearch ||
            u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(userSearch.toLowerCase()))
    );

    // Change de filtre : la liste repart du haut, sinon le changement passe inaperçu.
    function selectUlFilter(mine: boolean) {
        setMyUlOnly(mine);
        if (listRef.current) listRef.current.scrollTop = 0;
    }

    function handleSelect(id: string) {
        onChange(id);
        setShowDropdown(false);
        setUserSearch('');
    }

    return (
        <div className={styles.userDropdownWrapper} ref={dropdownRef}>
            <button
                id={id}
                type="button"
                className={`form-input ${styles.userDropdownTrigger}`}
                onClick={() => { setShowDropdown(v => !v); setUserSearch(''); setMyUlOnly(false); }}
                aria-haspopup="listbox"
                aria-expanded={showDropdown}
            >
                <span>{triggerLabel}</span>
                <span className={styles.dropdownChevron}>{showDropdown ? '▲' : '▼'}</span>
            </button>

            {showDropdown && (
                <div className={styles.userDropdown}>
                    <input
                        type="text"
                        className={styles.userDropdownSearch}
                        placeholder={placeholder}
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        autoFocus
                        aria-label={placeholder}
                    />
                    {canFilterByUl && (
                        <div className={styles.ulFilter} role="group" aria-label="Filtrer par unité locale">
                            <button
                                type="button"
                                className={`${styles.ulFilterBtn} ${!myUlOnly ? styles.ulFilterBtnActive : ''}`}
                                aria-pressed={!myUlOnly}
                                onClick={() => selectUlFilter(false)}
                            >
                                Toutes les UL
                            </button>
                            <button
                                type="button"
                                className={`${styles.ulFilterBtn} ${myUlOnly ? styles.ulFilterBtnActive : ''}`}
                                aria-pressed={myUlOnly}
                                onClick={() => selectUlFilter(true)}
                            >
                                Mon UL
                            </button>
                        </div>
                    )}
                    {canFilterByUl && (
                        <div className={styles.ulFilterCount} aria-live="polite">
                            {filteredUsers.length} {filteredUsers.length > 1 ? 'personnes' : 'personne'}
                        </div>
                    )}
                    <div className={styles.userDropdownList} role="listbox" ref={listRef}>
                        {!hideDefault && (
                            <div
                                role="option"
                                aria-selected={value === ''}
                                className={`${styles.userDropdownItem} ${value === '' ? styles.userDropdownItemSelected : ''}`}
                                onClick={() => handleSelect('')}
                            >
                                {defaultLabel}
                            </div>
                        )}
                        {filteredUsers.map(u => (
                            <div
                                key={u.id}
                                role="option"
                                aria-selected={value === u.id}
                                className={`${styles.userDropdownItem} ${value === u.id ? styles.userDropdownItemSelected : ''}`}
                                onClick={() => handleSelect(u.id)}
                            >
                                {u.name || u.email}
                            </div>
                        ))}
                        {filteredUsers.length === 0 && (userSearch || filterByUl) && (
                            <div className={styles.userDropdownEmpty}>Aucune personne trouvée</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
