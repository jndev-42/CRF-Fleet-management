'use client';

import { Lock, Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { CONTACT_CATEGORY_LABELS, cleanPhoneNumber, type FleetContact } from '@/lib/fleetTracking/contacts';
import styles from './fleetTracking.module.css';

interface Props {
    contact: FleetContact;
    /** Absent : contact proposé par une autre UL, en lecture seule (aucune action d'édition). */
    onEdit?: (contact: FleetContact) => void;
    onToggleShared?: (contact: FleetContact) => void;
    /** Modification du partage en cours : l'interrupteur est désactivé. */
    sharePending?: boolean;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Carte d'un contact prestataire. */
export default function ContactCard({ contact, onEdit, onToggleShared, sharePending = false }: Props) {
    const readOnly = !onEdit;
    return (
        <article className={`card ${styles.contactCard}${readOnly ? ` ${styles.sharedCard}` : ''}`} aria-label={contact.name}>
            <div className={styles.pills}>
                <span className={styles.pill}>{CONTACT_CATEGORY_LABELS[contact.category]}</span>
                {readOnly && contact.ulName && (
                    <span className={`${styles.pill} ${styles.pillShared}`}>Proposé par l&apos;UL {contact.ulName}</span>
                )}
            </div>
            <h4 className={styles.contactName}>{contact.name}</h4>

            {contact.phones.map((phone, i) => (
                <div key={`${phone.number}-${i}`} className={styles.line}>
                    <Phone size={14} aria-hidden="true" />
                    <a href={`tel:${cleanPhoneNumber(phone.number)}`} className={styles.phoneLink}>{phone.number}</a>
                    {phone.label && <span className={styles.dim}>{phone.label}</span>}
                </div>
            ))}
            {contact.email && (
                <div className={styles.line}>
                    <Mail size={14} aria-hidden="true" />
                    <a href={`mailto:${contact.email}`} className={styles.phoneLink}>{contact.email}</a>
                </div>
            )}
            {contact.address && (
                <div className={styles.line}>
                    <MapPin size={14} aria-hidden="true" />
                    <span>{contact.address}</span>
                </div>
            )}
            {contact.notes && <p className={`${styles.dim} ${styles.notes}`}>{contact.notes}</p>}

            <div className={styles.cardFooter}>
                {readOnly ? (
                    <>
                        <span className={styles.dim}>Mis à jour le {formatDate(contact.updatedAt)}</span>
                        <span className={styles.dim} title="Lecture seule"><Lock size={14} aria-label="Lecture seule" /></span>
                    </>
                ) : (
                    <>
                        <label className={styles.switchLabel}>
                            <input
                                type="checkbox"
                                role="switch"
                                className={styles.switchInput}
                                checked={contact.shared}
                                disabled={sharePending}
                                onChange={() => onToggleShared?.(contact)}
                                aria-label={`Partager ${contact.name} aux autres UL`}
                            />
                            <span className={styles.switchTrack} aria-hidden="true" />
                            Partagé aux autres UL
                        </label>
                        <button
                            type="button"
                            className={`btn btn-secondary ${styles.iconBtn}`}
                            onClick={() => onEdit(contact)}
                            aria-label={`Modifier ${contact.name}`}
                        >
                            <Pencil size={14} aria-hidden="true" />
                        </button>
                    </>
                )}
            </div>
        </article>
    );
}
