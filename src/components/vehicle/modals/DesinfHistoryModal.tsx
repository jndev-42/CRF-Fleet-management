'use client';

import { useState, useEffect } from 'react';
import type { DesinfectionRecord } from '@/app/vehicles/[id]/types';

interface DesinfHistoryModalProps {
    vehicleId: string;
    vehicleName: string;
    onClose: () => void;
}

/**
 * Modal affichant la main courante des désinfections d'un véhicule VPSP.
 * Fetche GET /api/vehicles/[name]/desinfections et affiche un tableau.
 */
export default function DesinfHistoryModal({ vehicleId, vehicleName, onClose }: DesinfHistoryModalProps) {
    const [desinfections, setDesinfections] = useState<DesinfectionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/vehicles/${encodeURIComponent(vehicleName)}/desinfections`)
            .then(res => res.json())
            .then(data => {
                if (data.desinfections) {
                    setDesinfections(data.desinfections);
                } else {
                    setError(data.error || 'Erreur lors du chargement');
                }
            })
            .catch(() => setError('Erreur de connexion'))
            .finally(() => setLoading(false));
    }, [vehicleId, vehicleName]);

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    return (
        <div className="modal-overlay" aria-hidden="true" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-desinf-title"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: 640 }}
            >
                <div className="modal-header">
                    <h2 id="modal-desinf-title" className="modal-title">
                        🧴 Désinfections — {vehicleName}
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">
                        ✕
                    </button>
                </div>

                <div className="modal-body">
                    {loading && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                            Chargement...
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ color: '#EF4444', padding: 16 }}>{error}</div>
                    )}

                    {!loading && !error && desinfections.length === 0 && (
                        <div className="empty-state" style={{ padding: '32px 0' }}>
                            <div className="empty-state-icon">🧴</div>
                            <div className="empty-state-title">Aucune désinfection enregistrée</div>
                        </div>
                    )}

                    {!loading && !error && desinfections.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Date</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Type</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Responsable</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>N° de lot</th>
                                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Conducteur</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {desinfections.map((d, i) => (
                                        <tr
                                            key={d.id}
                                            style={{
                                                borderBottom: i < desinfections.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                                background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                                            }}
                                        >
                                            <td style={{ padding: '10px 12px' }}>{formatDate(d.checkInAt)}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {d.desinfType ? (
                                                    <span style={{
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        padding: '2px 8px',
                                                        borderRadius: 99,
                                                        background: d.desinfType === 'complète' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                                                        color: d.desinfType === 'complète' ? '#059669' : '#3B82F6',
                                                    }}>
                                                        {d.desinfType === 'complète' ? '✨ Complète' : '🧼 Simple'}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>{d.desinfResponsable || '—'}</td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{d.desinfLotNumber || '—'}</td>
                                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.driverName || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
