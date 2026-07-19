'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash, Check, Eye, X, Receipt, CheckCircle, Clock, AlertCircle, Send, Edit } from 'lucide-react';
import ExpenseForm from '@/components/expenses/ExpenseForm';

interface ExpenseReport {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    submittedAt: string;
    status: 'brouillon' | 'soumis' | 'validé';
    requestRefund: boolean;
    noReceiptDeclaration: boolean;
    driveFolderId: string | null;
    total: number;
    items: { label: string; amount: number }[];
    ulId: string;
    validatedAt: string | null;
    validatedBy: string | null;
    validatorName: string | null;
    createdAt: string;
}

export default function ExpensesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [reports, setReports] = useState<ExpenseReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingReport, setEditingReport] = useState<ExpenseReport | null>(null);
    const [selectedReport, setSelectedReport] = useState<ExpenseReport | null>(null);
    const [photos, setPhotos] = useState<{ id: string; name: string }[]>([]);
    const [photosLoading, setPhotosLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const userRoles = session?.user?.roles || [];
    const isManager = userRoles.includes('SUPER_ADMIN') || userRoles.includes('PRESIDENT');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/expenses');
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (error) {
            console.error('Failed to fetch expense reports', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (status === 'authenticated') {
            fetchReports();
        }
    }, [status]);

    // Fetch photos for selected report
    useEffect(() => {
        if (selectedReport?.driveFolderId) {
            setPhotosLoading(true);
            setPhotos([]);
            fetch(`/api/drive/photos?folderId=${selectedReport.driveFolderId}&flat=true`)
                .then(res => res.json())
                .then(data => {
                    if (data.photos) {
                        setPhotos(data.photos);
                    }
                })
                .catch(err => console.error('Failed to fetch photos', err))
                .finally(() => setPhotosLoading(false));
        } else {
            setPhotos([]);
        }
    }, [selectedReport]);

    const handleValidate = async (id: string) => {
        if (!confirm('Voulez-vous vraiment valider cette note de frais ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'validate' })
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? { ...prev, status: 'validé', validatorName: session?.user?.name || '' } : null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la validation.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSubmitDraft = async (id: string) => {
        if (!confirm('Voulez-vous vraiment soumettre cette note de frais ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit' })
            });
            if (res.ok) {
                fetchReports();
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la soumission.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Voulez-vous vraiment supprimer cette note de frais ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la suppression.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status: ExpenseReport['status']) => {
        const styles: Record<ExpenseReport['status'], React.CSSProperties> = {
            brouillon: { background: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af', border: '1px solid rgba(107, 114, 128, 0.3)' },
            soumis: { background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' },
            validé: { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }
        };

        const labels = {
            brouillon: 'Brouillon',
            soumis: 'Soumis',
            validé: 'Validé'
        };

        const icons = {
            brouillon: <Clock size={12} style={{ marginRight: '4px' }} />,
            soumis: <Clock size={12} style={{ marginRight: '4px' }} />,
            validé: <CheckCircle size={12} style={{ marginRight: '4px' }} />
        };

        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                ...styles[status]
            }}>
                {icons[status]}
                {labels[status]}
            </span>
        );
    };

    const formatDate = (isoString: string) => {
        try {
            return new Date(isoString).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return isoString;
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Chargement des notes de frais...</div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 16px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Notes de frais
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {isManager ? 'Gérer et valider les notes de frais de l\'Unité Locale.' : 'Suivez et soumettez vos notes de frais.'}
                    </p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn btn-primary"
                        style={{ gap: '8px' }}
                    >
                        <Plus size={16} /> Nouvelle note de frais
                    </button>
                )}
            </div>

            {isCreating ? (
                <ExpenseForm
                    initialData={editingReport || undefined}
                    onClose={() => {
                        setIsCreating(false);
                        setEditingReport(null);
                    }}
                    onSuccess={() => {
                        setIsCreating(false);
                        setEditingReport(null);
                        fetchReports();
                        if (selectedReport && editingReport && selectedReport.id === editingReport.id) {
                            setSelectedReport(null);
                        }
                    }}
                />
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 400px' : '1fr', gap: '24px', alignItems: 'start' }}>
                    {/* List Section */}
                    <div style={{
                        background: 'var(--bg-primary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-primary)',
                        overflow: 'hidden'
                    }}>
                        {reports.length === 0 ? (
                            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <FileText size={48} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                                <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>Aucune note de frais</p>
                                <p style={{ fontSize: '0.8125rem', margin: 0 }}>
                                    {"Vous n'avez pas encore créé de note de frais."}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {isManager && <th style={{ padding: '12px 16px' }}>Collaborateur</th>}
                                            <th style={{ padding: '12px 16px' }}>Date</th>
                                            <th style={{ padding: '12px 16px' }}>Description</th>
                                            <th style={{ padding: '12px 16px' }}>Total</th>
                                            <th style={{ padding: '12px 16px' }}>Remboursement</th>
                                            <th style={{ padding: '12px 16px' }}>Statut</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reports.map((report) => (
                                            <tr
                                                key={report.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border-primary)',
                                                    background: selectedReport?.id === report.id ? 'var(--bg-secondary)' : 'transparent',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => setSelectedReport(report)}
                                            >
                                                {isManager && (
                                                    <td style={{ padding: '16px' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.userName}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{report.userEmail}</div>
                                                    </td>
                                                )}
                                                <td style={{ padding: '16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                    {formatDate(report.submittedAt || report.createdAt)}
                                                </td>
                                                <td style={{ padding: '16px', color: 'var(--text-primary)' }}>
                                                    {report.items.map(item => item.label).join(', ')}
                                                </td>
                                                <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {report.total.toFixed(2)} €
                                                </td>
                                                <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                                    {report.requestRefund ? 'Demandé' : 'Non demandé'}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    {getStatusBadge(report.status)}
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => setSelectedReport(report)}
                                                            className="btn btn-secondary"
                                                            style={{ padding: '6px 10px' }}
                                                            title="Voir les détails"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        {report.status === 'brouillon' && report.userId === session?.user?.id && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingReport(report);
                                                                        setIsCreating(true);
                                                                    }}
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '6px 10px' }}
                                                                    disabled={actionLoading === report.id}
                                                                    title="Modifier le brouillon"
                                                                >
                                                                    <Edit size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSubmitDraft(report.id)}
                                                                    className="btn btn-primary"
                                                                    style={{ padding: '6px 10px', background: '#f97316', borderColor: '#f97316' }}
                                                                    disabled={actionLoading === report.id}
                                                                    title="Soumettre la note de frais"
                                                                >
                                                                    <Send size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(report.id)}
                                                                    className="btn btn-danger"
                                                                    style={{ padding: '6px 10px' }}
                                                                    disabled={actionLoading === report.id}
                                                                    title="Supprimer"
                                                                >
                                                                    <Trash size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {report.status === 'soumis' && isManager && (
                                                            <button
                                                                onClick={() => handleValidate(report.id)}
                                                                className="btn btn-primary"
                                                                style={{ padding: '6px 10px', background: '#22c55e', borderColor: '#22c55e' }}
                                                                disabled={actionLoading === report.id}
                                                                title="Valider"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Detail Sidebar */}
                    {selectedReport && (
                        <div style={{
                            background: 'var(--bg-primary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--border-primary)',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            boxShadow: 'var(--shadow-md)',
                            position: 'sticky',
                            top: '20px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Détails de la note
                                </h3>
                                <button
                                    onClick={() => setSelectedReport(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                                    aria-label="Fermer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Submitter */}
                            <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Auteur
                                </span>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                                    {selectedReport.userName}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {selectedReport.userEmail}
                                </div>
                            </div>

                            {/* Date & Status */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Soumise le
                                    </span>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                                        {formatDate(selectedReport.submittedAt || selectedReport.createdAt)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                                        Statut
                                    </span>
                                    {getStatusBadge(selectedReport.status)}
                                </div>
                            </div>

                            {/* Validator (if validated) */}
                            {selectedReport.status === 'validé' && (
                                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Validée par
                                    </span>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                                        {selectedReport.validatorName || 'Administrateur'}
                                    </div>
                                    {selectedReport.validatedAt && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            le {formatDate(selectedReport.validatedAt)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Items List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                    Dépenses détaillées
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {selectedReport.items.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.amount.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontWeight: 700,
                                    fontSize: '0.9375rem',
                                    borderTop: '1px solid var(--border-primary)',
                                    paddingTop: '8px',
                                    marginTop: '4px',
                                    color: 'var(--text-primary)'
                                }}>
                                    <span>Total</span>
                                    <span>{selectedReport.total.toFixed(2)} €</span>
                                </div>
                            </div>

                            {/* Refund & receipt declaration */}
                            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                    <strong>Remboursement :</strong> {selectedReport.requestRefund ? 'Oui, remboursement demandé.' : 'Non, aucun remboursement demandé.'}
                                </div>
                                {selectedReport.noReceiptDeclaration && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '6px',
                                        padding: '8px',
                                        background: 'rgba(234, 179, 8, 0.08)',
                                        border: '1px solid rgba(234, 179, 8, 0.2)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: '#ca8a04',
                                        fontSize: '0.75rem'
                                    }}>
                                        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                                        <span>{"Certifié sur l'honneur (sans justificatif papier)."}</span>
                                    </div>
                                )}
                            </div>

                            {/* Photos gallery */}
                            {selectedReport.driveFolderId && (
                                <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Receipt size={14} /> Justificatifs ({photos.length})
                                    </span>

                                    {photosLoading ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Chargement des photos...</span>
                                    ) : photos.length === 0 ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aucun justificatif disponible.</span>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                            {photos.map(photo => (
                                                <a
                                                    key={photo.id}
                                                    href={`/api/drive/photos/${photo.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        aspectRatio: '1',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden',
                                                        border: '1px solid var(--border-primary)',
                                                        display: 'block'
                                                    }}
                                                    title={photo.name}
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={`/api/drive/photos/${photo.id}`}
                                                        alt={photo.name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sidebar Action button */}
                            {selectedReport.status === 'soumis' && isManager && (
                                <button
                                    onClick={() => handleValidate(selectedReport.id)}
                                    className="btn btn-primary"
                                    style={{ width: '100%', background: '#22c55e', borderColor: '#22c55e', marginTop: '8px', gap: '6px' }}
                                    disabled={actionLoading === selectedReport.id}
                                >
                                    <Check size={16} /> Valider cette note
                                </button>
                            )}

                            {selectedReport.status === 'brouillon' && selectedReport.userId === session?.user?.id && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '8px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleSubmitDraft(selectedReport.id)}
                                            className="btn btn-primary"
                                            style={{ flex: 1, background: '#f97316', borderColor: '#f97316', gap: '6px' }}
                                            disabled={actionLoading === selectedReport.id}
                                        >
                                            <Send size={14} /> Soumettre
                                        </button>
                                        <button
                                            onClick={() => handleDelete(selectedReport.id)}
                                            className="btn btn-danger"
                                            style={{ flex: 1, gap: '6px' }}
                                            disabled={actionLoading === selectedReport.id}
                                        >
                                            <Trash size={14} /> Supprimer
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setEditingReport(selectedReport);
                                            setIsCreating(true);
                                        }}
                                        className="btn btn-secondary"
                                        style={{ width: '100%', gap: '6px' }}
                                        disabled={actionLoading === selectedReport.id}
                                    >
                                        <Edit size={14} /> Modifier le brouillon
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
