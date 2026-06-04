'use client';

import React, { useEffect, useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import { formatDate } from '@/app/vehicles/[id]/utils';

interface Incident {
    id: string;
    vehicleId: string;
    userId: string;
    userName: string;
    userEmail: string;
    tripId: string | null;
    reservationId: string | null;
    type: 'FLASH' | 'ACCIDENT' | null;
    status: 'DRAFT' | 'SUBMITTED';
    occurredAt: string | null;
    createdAt: string;
    submittedAt: string | null;
    canEdit: boolean;
}

interface IncidentHistoryModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    onEditDraft: (incidentId: string) => void;
}

export default function IncidentHistoryModal({ vehicle, onClose, onEditDraft }: IncidentHistoryModalProps) {
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        fetchIncidents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vehicle.name]);

    async function fetchIncidents() {
        try {
            const res = await fetch(`/api/vehicles/${vehicle.name}/incidents`);
            if (!res.ok) {
                throw new Error('Erreur lors de la récupération des incidents');
            }
            const data = await res.json();
            setIncidents(data.incidents);
        } catch (err) {
            console.error(err);
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteDraft(reportId: string) {
        if (!confirm("Êtes-vous sûr de vouloir supprimer ce brouillon ?")) return;
        
        setDeletingId(reportId);
        try {
            const res = await fetch(`/api/incidents/${reportId}`, { method: 'DELETE' });
            if (res.ok) {
                fetchIncidents();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch (err) {
            console.error(err);
            alert('Erreur de connexion lors de la suppression');
        } finally {
            setDeletingId(null);
        }
    }

    async function handleDownloadPdf(reportId: string) {
        setDownloadingId(reportId);
        try {
            const pdfRes = await fetch(`/api/incidents/${reportId}/pdf`);
            if (pdfRes.ok) {
                const blob = await pdfRes.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `incident-report-${reportId}.pdf`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const pdfData = await pdfRes.json();
                alert(pdfData.error || 'Erreur lors de la génération du PDF');
            }
        } catch (err) {
            console.error(err);
            alert('Erreur de connexion lors du téléchargement');
        } finally {
            setDownloadingId(null);
        }
    }

    function formatOccurredAt(dateStr: string | null) {
        if (!dateStr) return 'Inconnue';
        const parts = dateStr.split('T');
        if (parts.length === 2) {
            const dateParts = parts[0].split('-');
            if (dateParts.length === 3) {
                return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} à ${parts[1]}`;
            }
        }
        return dateStr;
    }

    return (
        <div className="modal-overlay" aria-hidden="true" onClick={onClose} style={{ zIndex: 10001 }}>
            <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Historique des incidents - {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
                    ) : error ? (
                        <div className="error-banner" style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', borderRadius: '4px', marginBottom: '15px' }}>
                            {error}
                        </div>
                    ) : incidents.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            Aucun incident enregistré pour ce véhicule.
                        </div>
                    ) : (
                        <div className="incident-list">
                            {incidents.map(incident => (
                                <div key={incident.id} className="incident-card">
                                    <div className="incident-info">
                                        <div className="incident-header">
                                            <span className="incident-type">
                                                {incident.type === 'FLASH' ? '📸 Flash radar' : incident.type === 'ACCIDENT' ? '🚗 Accident' : '🚨 Incident non défini'}
                                            </span>
                                            <span className={`status-badge ${incident.status === 'SUBMITTED' ? 'status-submitted' : 'status-draft'}`}>
                                                {incident.status === 'SUBMITTED' ? 'Validé' : 'Brouillon'}
                                            </span>
                                        </div>
                                        <div className="incident-details">
                                            <div><strong>Date :</strong> {formatOccurredAt(incident.occurredAt)}</div>
                                            <div><strong>Auteur :</strong> {incident.userName || incident.userEmail}</div>
                                            {incident.submittedAt && (
                                                <div><strong>Soumis le :</strong> {formatDate(incident.submittedAt)}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="incident-actions">
                                        {incident.status === 'SUBMITTED' && (
                                            <button 
                                                className="btn btn-secondary"
                                                onClick={() => handleDownloadPdf(incident.id)}
                                                disabled={downloadingId === incident.id}
                                                style={{ fontSize: '13px', padding: '6px 12px' }}
                                            >
                                                {downloadingId === incident.id ? 'Génération...' : '📄 Télécharger PDF'}
                                            </button>
                                        )}
                                        {incident.status === 'DRAFT' && incident.canEdit && (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                    className="btn btn-secondary"
                                                    onClick={() => onEditDraft(incident.id)}
                                                    style={{ fontSize: '13px', padding: '6px 12px' }}
                                                >
                                                    ✏️ Continuer
                                                </button>
                                                <button 
                                                    className="btn btn-secondary"
                                                    onClick={() => handleDeleteDraft(incident.id)}
                                                    disabled={deletingId === incident.id}
                                                    style={{ fontSize: '13px', padding: '6px 12px', color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                                                >
                                                    {deletingId === incident.id ? '...' : '🗑️'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>

            <style jsx>{`
                .incident-list { display: flex; flex-direction: column; gap: 12px; }
                .incident-card { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-card); }
                .incident-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
                .incident-type { font-weight: 600; font-size: 15px; }
                .status-badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; }
                .status-submitted { background: rgba(16, 185, 129, 0.1); color: #059669; }
                .status-draft { background: rgba(245, 158, 11, 0.1); color: #D97706; }
                .incident-details { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 13px; color: var(--text-secondary); }
                .incident-actions { display: flex; flex-direction: column; gap: 8px; }
            `}</style>
        </div>
    );
}
