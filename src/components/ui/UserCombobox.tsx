'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './UserCombobox.module.css';

interface UserComboboxProps {
    users: { id: string; name: string | null; email: string }[];
    value: string;
    onChange: (userId: string) => void;
    excludeEmail?: string;
    defaultLabel?: string;
    placeholder?: string;
}

export default function UserCombobox({
    users,
    value,
    onChange,
    excludeEmail,
    defaultLabel = 'Moi-même',
    placeholder = 'Rechercher...',
}: UserComboboxProps) {
    const [userSearch, setUserSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
        ? 'Chauffeur non décidé'
        : value
        ? (selectedUser?.name || selectedUser?.email || defaultLabel)
        : defaultLabel;

    const filteredUsers = users.filter(u =>
        u.email !== excludeEmail &&
        (!userSearch ||
            u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(userSearch.toLowerCase()))
    );

    function handleSelect(id: string) {
        onChange(id);
        setShowDropdown(false);
        setUserSearch('');
    }

    return (
        <div className={styles.userDropdownWrapper} ref={dropdownRef}>
            <button
                type="button"
                className={`form-input ${styles.userDropdownTrigger}`}
                onClick={() => { setShowDropdown(v => !v); setUserSearch(''); }}
                aria-haspopup="listbox"
                aria-expanded={showDropdown}
            >
                <span>{triggerLabel}</span>
                <span className={styles.dropdownChevron}>{showDropdown ? '▲' : '▼'}</span>
            </button>

            {showDropdown && (
                <div className={styles.userDropdown} role="listbox">
                    <input
                        type="text"
                        className={styles.userDropdownSearch}
                        placeholder={placeholder}
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        autoFocus
                        aria-label={placeholder}
                    />
                    <div className={styles.userDropdownList}>
                        <div
                            role="option"
                            aria-selected={value === ''}
                            className={`${styles.userDropdownItem} ${value === '' ? styles.userDropdownItemSelected : ''}`}
                            onClick={() => handleSelect('')}
                        >
                            {defaultLabel}
                        </div>
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
                    </div>
                </div>
            )}
        </div>
    );
}
