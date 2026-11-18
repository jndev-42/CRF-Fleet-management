'use client';

import { useMemo, useState } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, type FleetContact } from '@/lib/fleetTracking/contacts';
import ContactCard from './ContactCard';
import ContactFormModal from './ContactFormModal';
import { filterContacts, type CategoryFilter } from './filterContacts';
import { useFleetContacts } from './useFleetContacts';
import { useVCardExport } from './useVCardExport';
import styles from './fleetTracking.module.css';

interface Props {
    ulName?: string;
}

/** Modale ouverte : `null` fermée, `'new'` création, sinon le contact modifié. */
type Editing = null | 'new' | FleetContact;

/**
 * Onglet « Contacts » : annuaire de l'UL (modifiable, partage par contact) et
 * prestataires proposés par les autres UL (lecture seule), export `.vcf`.
 */
export default function ContactsTab({ ulName }: Props) {
    const { own, shared, loading, error, refetch, toggleShared, pendingIds } = useFleetContacts();
    const { exporting, exportVCard } = useVCardExport();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('ALL');
    const [editing, setEditing] = useState<Editing>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const visibleOwn = useMemo(() => filterContacts(own, query, category), [own, query, category]);
    const visibleShared = useMemo(() => filterContacts(shared, query, category), [shared, query, category]);

    const handleToggle = async (contact: FleetContact) => {
        setActionError(await toggleShared(contact));
    };

    const handleExport = async () => {
        setActionError(await exportVCard());
    };

    const nothingToExport = own.length + shared.length === 0;
    const filters: CategoryFilter[] = ['ALL', ...CONTACT_CATEGORIES];

    return (
        <div>
            <div className={styles.toolbar}>
                <label className={styles.search}>
                    <Search size={16} aria-hidden="true" />
                    <input
                        type="search"
                        className="form-input"
                        placeholder="Nom, catégorie, ville…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        aria-label="Rechercher un contact"
                    />
                </label>
                <div className="filters-bar" role="group" aria-label="Filtrer par catégorie" style={{ margin: 0 }}>
                    {filters.map(f => (
                        <button
                            key={f}
                            type="button"
                            className={`filter-btn${category === f ? ' active' : ''}`}
                            aria-pressed={category === f}
                            onClick={() => setCategory(f)}
                        >
                            {f === 'ALL' ? 'Tous' : CONTACT_CATEGORY_LABELS[f]}
                        </button>
                    ))}
                </div>
                <div className={styles.toolbarActions}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleExport}
                        disabled={loading || exporting || nothingToExport}
                        title={nothingToExport ? 'Aucun contact à exporter' : undefined}
                    >
                        <Download size={16} aria-hidden="true" /> {exporting ? 'Export…' : 'Exporter vers le téléphone'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                        <Plus size={16} aria-hidden="true" /> Contact
                    </button>
                </div>
            </div>

            {(error || actionError) && <p role="alert" className={styles.error}>{actionError || error}</p>}

            <h3 className={styles.sectionTitle}>
                Contacts de l&apos;UL{ulName ? ` ${ulName}` : ''} <span className={styles.dim}>· {visibleOwn.length}</span>
            </h3>
            <p className={styles.dim}>
                Un contact partagé (notes comprises) est visible en lecture seule par toutes les UL.
            </p>
            {loading ? (
                <p role="status" className={styles.dim}>Chargement des contacts…</p>
            ) : visibleOwn.length === 0 ? (error ? null : (
                <p className={styles.dim}>{own.length === 0 ? 'Aucun contact pour l’instant.' : 'Aucun contact ne correspond à la recherche.'}</p>
            )) : (
                <div className={styles.grid}>
                    {visibleOwn.map(c => (
                        <ContactCard key={c.id} contact={c} onEdit={setEditing} onToggleShared={handleToggle} sharePending={pendingIds.has(c.id)} />
                    ))}
                </div>
            )}

            {visibleShared.length > 0 && (
                <section aria-label="Prestataires proposés par d'autres UL">
                    <h3 className={styles.sectionTitle}>
                        Prestataires proposés par d&apos;autres UL <span className={styles.dim}>· lecture seule</span>
                    </h3>
                    <div className={styles.grid}>
                        {visibleShared.map(c => <ContactCard key={c.id} contact={c} />)}
                    </div>
                </section>
            )}

            {editing && (
                <ContactFormModal
                    contact={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={(message) => {
                        setEditing(null);
                        setActionError(message ?? null);
                        void refetch();
                    }}
                />
            )}
        </div>
    );
}
