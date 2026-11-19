'use client';

import { Plus, Trash2 } from 'lucide-react';
import { MAX_PHONE_LABEL, MAX_PHONE_NUMBER, MAX_PHONES, type ContactPhone } from '@/lib/fleetTracking/contacts';
import styles from './fleetTracking.module.css';

interface Props {
    phones: ContactPhone[];
    onChange: (phones: ContactPhone[]) => void;
}

/** Téléphones d'un contact : 1 à 5 lignes « libellé + numéro ». */
export default function PhoneFields({ phones, onChange }: Props) {
    const update = (index: number, patch: Partial<ContactPhone>) =>
        onChange(phones.map((p, i) => (i === index ? { ...p, ...patch } : p)));

    return (
        <fieldset className={styles.fieldset}>
            <legend className="form-label">Téléphones *</legend>
            {phones.map((phone, i) => (
                <div key={i} className={styles.phoneRow}>
                    <input
                        className="form-input"
                        placeholder="Numéro"
                        inputMode="tel"
                        value={phone.number}
                        maxLength={MAX_PHONE_NUMBER}
                        onChange={e => update(i, { number: e.target.value })}
                        aria-label={`Numéro ${i + 1}`}
                        required={i === 0}
                    />
                    <input
                        className="form-input"
                        placeholder="Libellé (Atelier, Gérant…)"
                        value={phone.label}
                        maxLength={MAX_PHONE_LABEL}
                        onChange={e => update(i, { label: e.target.value })}
                        aria-label={`Libellé du numéro ${i + 1}`}
                    />
                    {phones.length > 1 && (
                        <button
                            type="button"
                            className={`btn btn-secondary ${styles.iconBtn}`}
                            onClick={() => onChange(phones.filter((_, j) => j !== i))}
                            aria-label={`Retirer le numéro ${i + 1}`}
                        >
                            <Trash2 size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>
            ))}
            {phones.length < MAX_PHONES && (
                <button type="button" className="btn btn-secondary" onClick={() => onChange([...phones, { label: '', number: '' }])}>
                    <Plus size={14} aria-hidden="true" /> Ajouter un numéro
                </button>
            )}
        </fieldset>
    );
}
