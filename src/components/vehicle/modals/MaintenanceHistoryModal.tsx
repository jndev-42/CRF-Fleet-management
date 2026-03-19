'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vehicle, MaintenanceRecord } from '@/app/vehicles/[id]/types';

interface MaintenanceHistoryModalProps {
    vehicle: Vehicle;
    isAdmin: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    CT: 'Contrôle technique',
    REVISION: 'Révision',
    CT_REVISION: 'CT + Révision',
};

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

const defaultForm = { date: '', type: 'CT' as 'CT' | 'REVISION' | 'CT_REVISION', mileage: '' };

/**
 * Modal affichant l'historique des contrôles techniques et révisions d'un véhicule.
 * Les admins peuvent ajouter ou supprimer des entrées.
 */
export default function MaintenanceHistoryModal({
    vehicle,
    isAdmin,
    onClose,
    onSuccess,
}: MaintenanceHistoryModalProps) {
    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(defaultForm);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const vehicleName = encodeURIComponent(vehicle.name);

    const fetchRecords = useCallback(async (p: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/vehicles/${vehicleName}/maintenance?page=${p}`);
            const data = await res.json();
            if (res.ok) {
                setRecords(data.records);
                setTotal(data.total);
                setPage(data.page);
                setTotalPages(data.totalPages);
            } else {
                setError(data.error || 'Erreur lors du chargement');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }, [vehicleName]);

    useEffect(() => {
        fetchRecords(1);
    }, [fetchRecords]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const body: Record<string, unknown> = {
                date: form.date,
                type: form.type,
            };
            if ((form.type === 'REVISION' || form.type === 'CT_REVISION') && form.mileage) {
                body.mileage = parseInt(form.mileage);
            }
            const res = await fetch(`/api/vehicles/${vehicleName}/maintenance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setForm(defaultForm);
                setShowForm(false);
                await fetchRecords(1);
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la création');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(recordId: string) {
        if (!window.confirm('Supprimer cet enregistrement ?')) return;
        setDeleting(recordId);
        try {
            const res = await fetch(`/api/vehicles/${vehicleName}/maintenance/${recordId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                const newPage = records.length === 1 && page > 1 ? page - 1 : page;
                await fetchRecords(newPage);
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setDeleting(null);
        }
    }

    const showMileage = form.type === 'REVISION' || form.type === 'CT_REVISION';

    return (
        <div className="modal-overlay" aria-hidden="true" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-maintenance-title"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 680 }}
            >
                <div className="modal-header">
                    <h2 id="modal-maintenance-title" className="modal-title">
                        Entretien — {vehicle.name}
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">
                        ✕
                    </button>
                </div>

                <div className="modal-body">
                    {isAdmin && (
                        <div style={{ marginBottom: 16 }}>
                            {!showForm ? (
                                <button
                                    className="btn btn-primary"
                                    style={{ fontSize: 13, padding: '6px 14px' }}
                                    onClick={() => setShowForm(true)}
                                >
                                    + Ajouter
                                </button>
                            ) : (
                                <form onSubmit={handleSubmit} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 16, border: '1px solid var(--border-primary)' }}>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Date *</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={form.date}
                                                onChange={e => setForm({ ...form, date: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Type *</label>
                                            <select
                                                className="form-select"
                                                value={form.type}
                                                onChange={e => setForm({ ...form, type: e.target.value as typeof form.type })}
                                            >
                                                <option value="CT">Contrôle technique</option>
                                                <option value="REVISION">Révision</option>
                                                <option value="CT_REVISION">Les deux</option>
                                            </select>
                                        </div>
                                    </div>
                                    {showMileage && (
                                        <div className="form-group">
                                            <label className="form-label">Kilométrage</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="form-input"
                                                placeholder="ex: 62000"
                                                value={form.mileage}
                                                onChange={e => setForm({ ...form, mileage: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                        <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} disabled={submitting}>
                                            {submitting ? 'Enregistrement...' : 'Valider'}
                                        </button>
                                        <button type="button" className="btn btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => { setShowForm(false); setForm(defaultForm); }}>
                                            Annuler
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {loading && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                            Chargement...
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ color: '#EF4444', padding: 16 }}>{error}</div>
                    )}

                    {!loading && !error && total === 0 && (
                        <div className="empty-state" style={{ padding: '32px 0' }}>
                            <div className="empty-state-icon">🔧</div>
                            <div className="empty-state-title">Aucun enregistrement</div>
                        </div>
                    )}

                    {!loading && !error && records.length > 0 && (
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Type</th>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Kilométrage</th>
                                            {isAdmin && <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {records.map((r, i) => (
                                            <tr
                                                key={r.id}
                                                style={{
                                                    borderBottom: i < records.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                                    background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                                                }}
                                            >
                                                <td style={{ padding: '10px 12px' }}>{formatDate(r.date)}</td>
                                                <td style={{ padding: '10px 12px' }}>{TYPE_LABELS[r.type] ?? r.type}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                                    {r.mileage !== null ? `${r.mileage.toLocaleString('fr-FR')} km` : '—'}
                                                </td>
                                                {isAdmin && (
                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: 12, padding: '3px 8px', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}
                                                            onClick={() => handleDelete(r.id)}
                                                            disabled={deleting === r.id}
                                                            aria-label="Supprimer cet enregistrement"
                                                        >
                                                            {deleting === r.id ? '...' : '🗑️'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <nav aria-label="Pagination de l'historique" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, fontSize: 14 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '6px 14px' }}
                                        onClick={() => fetchRecords(page - 1)}
                                        disabled={page === 1}
                                        aria-label="Page précédente"
                                    >
                                        ← Précédent
                                    </button>
                                    <span style={{ color: 'var(--text-secondary)' }} aria-live="polite">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '6px 14px' }}
                                        onClick={() => fetchRecords(page + 1)}
                                        disabled={page === totalPages}
                                        aria-label="Page suivante"
                                    >
                                        Suivant →
                                    </button>
                                </nav>
                            )}
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}
