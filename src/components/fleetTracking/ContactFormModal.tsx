'use client';

import { useState, type FormEvent } from 'react';
import {
    CONTACT_CATEGORIES,
    CONTACT_CATEGORY_LABELS,
    MAX_CONTACT_NAME,
    MAX_CONTACT_TEXT,
    type ContactCategory,
    type ContactPhone,
    type FleetContact,
} from '@/lib/fleetTracking/contacts';
import PhoneFields from './PhoneFields';
import { CONTACTS_URL, readError } from './useFleetContacts';
import { useModalFocus } from './useModalFocus';
import styles from './fleetTracking.module.css';

interface Props {
    /** `null` : création d'un contact dans l'UL active. */
    contact: FleetContact | null;
    onClose: () => void;
    /** Enregistré (ou contact disparu entre-temps : `message` l'explique) ; la liste est rechargée. */
    onSaved: (message?: string) => void;
}

/** Création, modification et suppression d'un contact de l'UL. */
export default function ContactFormModal({ contact, onClose, onSaved }: Props) {
    const [saving, setSaving] = useState(false);
    // Pas de fermeture pendant l'enregistrement : une erreur tardive serait perdue.
    const requestClose = () => {
        if (!saving) onClose();
    };
    const dialogRef = useModalFocus<HTMLDivElement>(requestClose);
    const [name, setName] = useState(contact?.name ?? '');
    const [category, setCategory] = useState<ContactCategory>(contact?.category ?? 'GARAGE');
    const [phones, setPhones] = useState<ContactPhone[]>(contact?.phones.length ? contact.phones : [{ label: '', number: '' }]);
    const [email, setEmail] = useState(contact?.email ?? '');
    const [address, setAddress] = useState(contact?.address ?? '');
    const [notes, setNotes] = useState(contact?.notes ?? '');
    const [shared, setShared] = useState(contact?.shared ?? false);
    const [error, setError] = useState<string | null>(null);

    const send = async (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
        setSaving(true);
        setError(null);
        try {
            const url = contact ? `${CONTACTS_URL}/${encodeURIComponent(contact.id)}` : CONTACTS_URL;
            const res = await fetch(url, {
                method,
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (res.status === 404 && contact) {
                onSaved('Ce contact n\u2019existe plus : la liste a été actualisée.');
                return;
            }
            if (!res.ok) {
                setError(await readError(res, 'Enregistrement impossible'));
                return;
            }
            onSaved();
        } catch {
            setError('Enregistrement impossible');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = phones.map(p => ({ label: p.label.trim(), number: p.number.trim() }));
        const orphan = trimmed.find(p => p.label && !p.number);
        if (orphan) {
            setError(`Numéro manquant pour le libellé « ${orphan.label} »`);
            return;
        }
        const cleanPhones = trimmed.filter(p => p.number);
        if (cleanPhones.length === 0) {
            setError('Au moins un téléphone est requis');
            return;
        }
        void send(contact ? 'PATCH' : 'POST', {
            name: name.trim(), category, phones: cleanPhones,
            email: email.trim() || null, address: address.trim() || null, notes: notes.trim() || null, shared,
        });
    };

    const handleDelete = () => {
        if (contact && window.confirm(`Supprimer le contact « ${contact.name} » ?`)) void send('DELETE');
    };

    return (
        <div className="modal-overlay" onClick={requestClose}>
            <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="contact-modal-title" className="modal-title">{contact ? 'Modifier le contact' : 'Nouveau contact'}</h2>
                    <button type="button" className="modal-close" onClick={requestClose} disabled={saving} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="contact-name">Nom *</label>
                                <input id="contact-name" data-autofocus className="form-input" value={name} maxLength={MAX_CONTACT_NAME} required onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="contact-category">Catégorie *</label>
                                <select id="contact-category" className="form-select" value={category} onChange={e => setCategory(e.target.value as ContactCategory)}>
                                    {CONTACT_CATEGORIES.map(c => <option key={c} value={c}>{CONTACT_CATEGORY_LABELS[c]}</option>)}
                                </select>
                            </div>
                        </div>
                        <PhoneFields phones={phones} onChange={setPhones} />
                        <div className="form-group">
                            <label className="form-label" htmlFor="contact-email">E-mail</label>
                            <input id="contact-email" type="email" className="form-input" value={email} maxLength={254} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="contact-address">Adresse</label>
                            <input id="contact-address" className="form-input" value={address} maxLength={MAX_CONTACT_TEXT} onChange={e => setAddress(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="contact-notes">Notes</label>
                            <textarea id="contact-notes" className="form-input" rows={3} value={notes} maxLength={MAX_CONTACT_TEXT} onChange={e => setNotes(e.target.value)} />
                        </div>
                        <label className={styles.checkboxLine}>
                            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
                            Partager ce contact aux autres UL (lecture seule pour elles)
                        </label>
                        <p className={styles.hint}>Partagé, le contact est visible par toutes les UL, notes comprises.</p>
                        {error && <p role="alert" className={styles.error}>{error}</p>}
                    </div>
                    <div className="modal-footer">
                        {contact && (
                            <button type="button" className={`btn btn-secondary ${styles.danger}`} onClick={handleDelete} disabled={saving}>Supprimer</button>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={saving}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
