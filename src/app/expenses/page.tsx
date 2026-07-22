'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash, Check, Eye, X, Receipt, CheckCircle, Clock, AlertCircle, Send, Edit, XCircle, DollarSign, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import YousignSignatureModal, { SignatureData } from '@/components/expenses/YousignSignatureModal';

interface ExpenseReport {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    submittedAt: string;
    status: 'brouillon' | 'soumis' | 'en_attente_paiement' | 'traité' | 'refusé';
    imputation: 'DLUS' | 'DLAS' | 'UL' | 'Autre';
    customImputation: string | null;
    requestRefund: boolean;
    noReceiptDeclaration: boolean;
    driveFolderId: string | null;
    total: number;
    items: { label: string; amount: number }[];
    ulId: string;
    userFunction?: string | null;
    userSignature?: string | null;
    validatorSignature?: string | null;
    validatedAt: string | null;
    validatedBy: string | null;
    validatorName: string | null;
    rejectionComment: string | null;
    rejectedAt: string | null;
    rejectedBy: string | null;
    rejectorName: string | null;
    paidAt: string | null;
    paidBy: string | null;
    payerName: string | null;
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
    const [photos, setPhotos] = useState<{ id: string; name: string; mimeType?: string }[]>([]);
    const [photosLoading, setPhotosLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isJustificatifsModalOpen, setIsJustificatifsModalOpen] = useState(false);
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

    const isPdfItem = (item: { name: string; mimeType?: string }) => {
        return item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
    };

    const userRoles = session?.user?.roles || [];
    const isManager = userRoles.includes('SUPER_ADMIN') || userRoles.includes('PRESIDENT');
    const isTresorier = userRoles.includes('TRESORIER');
    const canPay = userRoles.includes('TRESORIER') || userRoles.includes('SUPER_ADMIN');

    const [viewScope, setViewScope] = useState<'ul' | 'my'>(() => (isManager || isTresorier ? 'ul' : 'my'));
    const [includeProcessed, setIncludeProcessed] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const fetchReports = useCallback(async (scope = viewScope, incProc = includeProcessed) => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.set('scope', scope);
            if (incProc) params.set('includeProcessed', 'true');

            const res = await fetch(`/api/expenses?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setReports(data);
            }
        } catch (error) {
            console.error('Failed to fetch expense reports', error);
        } finally {
            setLoading(false);
        }
    }, [viewScope, includeProcessed]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchReports(viewScope, includeProcessed);
        }
    }, [status, viewScope, includeProcessed, fetchReports]);

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

    const [validatingReport, setValidatingReport] = useState<ExpenseReport | null>(null);

    // Sorting state
    type SortField = 'userName' | 'date' | 'imputation' | 'description' | 'total' | 'requestRefund' | 'status';
    type SortOrder = 'asc' | 'desc';
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setPage(1);
    };

    const sortedReports = useMemo(() => {
        return [...reports].sort((a, b) => {
            let valA: string | number = '';
            let valB: string | number = '';

            switch (sortField) {
                case 'userName':
                    valA = (a.userName || '').toLowerCase();
                    valB = (b.userName || '').toLowerCase();
                    break;
                case 'date':
                    valA = new Date(a.submittedAt || a.createdAt).getTime();
                    valB = new Date(b.submittedAt || b.createdAt).getTime();
                    break;
                case 'imputation':
                    valA = ((a.imputation === 'Autre' ? a.customImputation : a.imputation) || '').toLowerCase();
                    valB = ((b.imputation === 'Autre' ? b.customImputation : b.imputation) || '').toLowerCase();
                    break;
                case 'description':
                    valA = (a.items.map(i => i.label).join(', ')).toLowerCase();
                    valB = (b.items.map(i => i.label).join(', ')).toLowerCase();
                    break;
                case 'total':
                    valA = a.total;
                    valB = b.total;
                    break;
                case 'requestRefund':
                    valA = a.requestRefund ? 1 : 0;
                    valB = b.requestRefund ? 1 : 0;
                    break;
                case 'status':
                    valA = (a.status || '').toLowerCase();
                    valB = (b.status || '').toLowerCase();
                    break;
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [reports, sortField, sortOrder]);

    const totalPages = Math.ceil(sortedReports.length / pageSize) || 1;
    const paginatedReports = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedReports.slice(start, start + pageSize);
    }, [sortedReports, page, pageSize]);

    const renderSortHeader = (label: string, field: SortField) => {
        const isActive = sortField === field;
        return (
            <th
                onClick={() => handleSort(field)}
                style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap'
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>{label}</span>
                    {isActive ? (
                        sortOrder === 'asc' ? <ArrowUp size={14} color="var(--red-primary, #ef4444)" /> : <ArrowDown size={14} color="var(--red-primary, #ef4444)" />
                    ) : (
                        <ArrowUpDown size={13} style={{ opacity: 0.4 }} />
                    )}
                </div>
            </th>
        );
    };

    const openValidateModal = (report: ExpenseReport) => {
        setValidatingReport(report);
    };

    const confirmValidate = async (sigData?: SignatureData) => {
        if (!validatingReport) return;

        const id = validatingReport.id;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'validate',
                    validatorSignature: sigData || null,
                })
            });
            if (res.ok) {
                const data = await res.json();
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: data.status || 'traité',
                        validatorName: session?.user?.name || ''
                    } : null);
                }
                setValidatingReport(null);
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

    const handleReject = async (id: string) => {
        const comment = prompt('Veuillez indiquer le motif du refus de cette note de frais :');
        if (comment === null) return; // Annulé par l'utilisateur
        if (!comment.trim()) {
            alert('Le commentaire est obligatoire pour refuser une note de frais.');
            return;
        }

        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject', rejectionComment: comment })
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: 'refusé',
                        rejectionComment: comment.trim(),
                        rejectorName: session?.user?.name || ''
                    } : null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors du refus.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handlePay = async (id: string) => {
        if (!confirm('Voulez-vous indiquer cette note de frais comme payée ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pay' })
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: 'traité',
                        payerName: session?.user?.name || ''
                    } : null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors du paiement.');
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
            en_attente_paiement: { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' },
            traité: { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' },
            refusé: { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }
        };

        const labels: Record<ExpenseReport['status'], string> = {
            brouillon: 'Brouillon',
            soumis: 'Soumis',
            en_attente_paiement: 'En attente de paiement',
            traité: 'Traitée',
            refusé: 'Refusé'
        };

        const icons: Record<ExpenseReport['status'], React.ReactNode> = {
            brouillon: <Clock size={12} style={{ marginRight: '4px' }} />,
            soumis: <Clock size={12} style={{ marginRight: '4px' }} />,
            en_attente_paiement: <Clock size={12} style={{ marginRight: '4px' }} />,
            traité: <CheckCircle size={12} style={{ marginRight: '4px' }} />,
            refusé: <XCircle size={12} style={{ marginRight: '4px' }} />
        };

        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 10px',
                borderRadius: '99px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
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
                        {isManager
                            ? 'Gérer, valider et refuser les notes de frais de l\'Unité Locale.'
                            : isTresorier
                            ? 'Consulter les notes en attente de paiement et effectuer les règlements.'
                            : 'Suivez et soumettez vos notes de frais.'}
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

            {/* Scope & Filter Toggles for Managers & Tresorier */}
            {(isManager || isTresorier) && !isCreating && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    background: 'var(--bg-secondary)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-primary)'
                }}>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-primary)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                        <button
                            type="button"
                            onClick={() => setViewScope('ul')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 'var(--radius-sm)',
                                border: 'none',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: viewScope === 'ul' ? 'var(--red-primary, #ef4444)' : 'transparent',
                                color: viewScope === 'ul' ? '#ffffff' : 'var(--text-secondary)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isManager ? 'Notes à traiter (UL)' : 'Notes en attente de paiement'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewScope('my')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 'var(--radius-sm)',
                                border: 'none',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: viewScope === 'my' ? 'var(--red-primary, #ef4444)' : 'transparent',
                                color: viewScope === 'my' ? '#ffffff' : 'var(--text-secondary)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            Mes notes de frais
                        </button>
                    </div>

                    {isManager && viewScope === 'ul' && (
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.8125rem',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            fontWeight: 500
                        }}>
                            <input
                                type="checkbox"
                                checked={includeProcessed}
                                onChange={(e) => setIncludeProcessed(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span>Afficher toutes les notes (y compris déjà traitées)</span>
                        </label>
                    )}
                </div>
            )}

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
                                    {"Vous n'avez pas encore de note de frais dans cette liste."}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {(isManager || isTresorier) && renderSortHeader('Collaborateur', 'userName')}
                                            {renderSortHeader('Date', 'date')}
                                            {renderSortHeader('Imputation', 'imputation')}
                                            {renderSortHeader('Description', 'description')}
                                            {renderSortHeader('Total', 'total')}
                                            {renderSortHeader('Remboursement', 'requestRefund')}
                                            {renderSortHeader('Statut', 'status')}
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedReports.map((report) => (
                                            <tr
                                                key={report.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border-primary)',
                                                    background: selectedReport?.id === report.id ? 'var(--bg-secondary)' : 'transparent',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => setSelectedReport(report)}
                                            >
                                                {(isManager || isTresorier) && (
                                                    <td style={{ padding: '16px' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.userName}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{report.userEmail}</div>
                                                    </td>
                                                )}
                                                <td style={{ padding: '16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                    {formatDate(report.submittedAt || report.createdAt)}
                                                </td>
                                                <td style={{ padding: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                    {report.imputation === 'Autre' ? (report.customImputation || 'Autre') : report.imputation}
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
                                                <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
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
                                                        {report.status !== 'brouillon' && (
                                                            <a
                                                                href={`/api/expenses/${report.id}/pdf`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn btn-secondary"
                                                                style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center' }}
                                                                title="Télécharger le PDF officiel"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <Download size={14} />
                                                            </a>
                                                        )}
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
                                                            <>
                                                                <button
                                                                    onClick={() => openValidateModal(report)}
                                                                    className="btn btn-primary"
                                                                    style={{ padding: '6px 10px', background: '#22c55e', borderColor: '#22c55e' }}
                                                                    disabled={actionLoading === report.id}
                                                                    title="Valider"
                                                                >
                                                                    <Check size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReject(report.id)}
                                                                    className="btn btn-danger"
                                                                    style={{ padding: '6px 10px' }}
                                                                    disabled={actionLoading === report.id}
                                                                    title="Refuser"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {report.status === 'en_attente_paiement' && canPay && (
                                                            <button
                                                                onClick={() => handlePay(report.id)}
                                                                className="btn btn-primary"
                                                                style={{ padding: '6px 10px', background: '#3b82f6', borderColor: '#3b82f6' }}
                                                                disabled={actionLoading === report.id}
                                                                title="Indiquer comme payée"
                                                            >
                                                                <DollarSign size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Bar */}
                            {sortedReports.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    borderTop: '1px solid var(--border-primary)',
                                    background: 'var(--bg-secondary)',
                                    fontSize: '0.8125rem',
                                    color: 'var(--text-secondary)',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span>
                                            Affichage de {Math.min((page - 1) * pageSize + 1, sortedReports.length)} à {Math.min(page * pageSize, sortedReports.length)} sur {sortedReports.length} notes
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Afficher :</span>
                                            <select
                                                value={pageSize}
                                                onChange={(e) => {
                                                    setPageSize(Number(e.target.value));
                                                    setPage(1);
                                                }}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--border-primary)',
                                                    background: 'var(--bg-primary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.8125rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value={5}>5</option>
                                                <option value={10}>10</option>
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="btn btn-secondary"
                                            style={{ padding: '4px 8px', opacity: page === 1 ? 0.5 : 1 }}
                                            title="Page précédente"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', padding: '0 4px' }}>
                                            Page {page} sur {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                            className="btn btn-secondary"
                                            style={{ padding: '4px 8px', opacity: page >= totalPages ? 0.5 : 1 }}
                                            title="Page suivante"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
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

                            {/* Date, Imputation & Status */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Soumise le
                                    </span>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                                        {formatDate(selectedReport.submittedAt || selectedReport.createdAt)}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginTop: '8px' }}>
                                        Imputation
                                    </span>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                                        {selectedReport.imputation === 'Autre' ? (selectedReport.customImputation || 'Autre') : selectedReport.imputation}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                                        Statut
                                    </span>
                                    {getStatusBadge(selectedReport.status)}
                                </div>
                            </div>

                            {/* Rejection comment display */}
                            {selectedReport.status === 'refusé' && selectedReport.rejectionComment && (
                                <div style={{
                                    padding: '12px',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    color: '#ef4444'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <XCircle size={14} /> Motif du refus
                                    </div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                        {selectedReport.rejectionComment}
                                    </div>
                                    {selectedReport.rejectorName && (
                                        <div style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-tertiary)' }}>
                                            Refusée par {selectedReport.rejectorName} {selectedReport.rejectedAt ? `le ${formatDate(selectedReport.rejectedAt)}` : ''}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Validator (if validated or paid) */}
                            {(selectedReport.validatedBy || selectedReport.validatorName) && (
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

                            {/* Payer details (if paid) */}
                            {selectedReport.paidAt && (
                                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Payée par
                                    </span>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                                        {selectedReport.payerName || 'Trésorier'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        le {formatDate(selectedReport.paidAt)}
                                    </div>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Receipt size={14} /> Justificatifs ({photos.length})
                                        </span>
                                        {photos.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setIsJustificatifsModalOpen(true)}
                                                style={{ background: 'none', border: 'none', color: 'var(--red-primary, #ef4444)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                            >
                                                Voir tout
                                            </button>
                                        )}
                                    </div>

                                    {photosLoading ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Chargement des justificatifs...</span>
                                    ) : photos.length === 0 ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aucun justificatif disponible.</span>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                            {photos.map(photo => {
                                                const pdf = isPdfItem(photo);
                                                if (pdf) {
                                                    return (
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
                                                                background: 'var(--bg-secondary)',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '4px',
                                                                textDecoration: 'none',
                                                                gap: '2px',
                                                                textAlign: 'center'
                                                            }}
                                                            title={`Ouvrir/Télécharger ${photo.name}`}
                                                        >
                                                            <FileText size={20} color="var(--red-primary, #ef4444)" />
                                                            <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--text-primary)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {photo.name}
                                                            </span>
                                                            <span style={{ fontSize: '7px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>PDF</span>
                                                        </a>
                                                    );
                                                }
                                                return (
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
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sidebar PDF Download Button */}
                            {selectedReport.status !== 'brouillon' && (
                                <a
                                    href={`/api/expenses/${selectedReport.id}/pdf`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}
                                >
                                    <Download size={16} /> Télécharger le PDF officiel
                                </a>
                            )}

                            {/* Sidebar Action buttons */}
                            {selectedReport.status === 'soumis' && isManager && (
                                <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                                    <button
                                        onClick={() => openValidateModal(selectedReport)}
                                        className="btn btn-primary"
                                        style={{ flex: 1, background: '#22c55e', borderColor: '#22c55e', gap: '6px' }}
                                        disabled={actionLoading === selectedReport.id}
                                    >
                                        <Check size={16} /> Valider
                                    </button>
                                    <button
                                        onClick={() => handleReject(selectedReport.id)}
                                        className="btn btn-danger"
                                        style={{ flex: 1, gap: '6px' }}
                                        disabled={actionLoading === selectedReport.id}
                                    >
                                        <X size={16} /> Refuser
                                    </button>
                                </div>
                            )}

                            {selectedReport.status === 'en_attente_paiement' && canPay && (
                                <button
                                    onClick={() => handlePay(selectedReport.id)}
                                    className="btn btn-primary"
                                    style={{ width: '100%', background: '#3b82f6', borderColor: '#3b82f6', marginTop: '8px', gap: '6px' }}
                                    disabled={actionLoading === selectedReport.id}
                                >
                                    <DollarSign size={16} /> Indiquer comme payée
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

            {/* Modale Yousign Signature du Valideur */}
            {validatingReport && (
                <YousignSignatureModal
                    isOpen={Boolean(validatingReport)}
                    onClose={() => setValidatingReport(null)}
                    onSign={(sigData) => {
                        confirmValidate(sigData);
                    }}
                    signerName={session?.user?.name || 'Président / Responsable'}
                    signerEmail={session?.user?.email || ''}
                    roleTitle="Responsable / Valideur"
                    initialFunction="Président local"
                    loading={actionLoading === validatingReport.id}
                />
            )}

            {/* Modale d'affichage des justificatifs (photos & PDF) */}
            {isJustificatifsModalOpen && selectedReport && (
                <div className="modal-overlay" onClick={() => setIsJustificatifsModalOpen(false)} style={{ zIndex: 9999, backdropFilter: 'blur(5px)' }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                                <Receipt size={20} /> Justificatifs de la note de frais ({photos.length})
                            </h2>
                            <button className="modal-close" onClick={() => setIsJustificatifsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            {photos.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                                    Aucun justificatif disponible.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                    {photos.map(photo => {
                                        const pdf = isPdfItem(photo);
                                        const fileUrl = `/api/drive/photos/${photo.id}`;
                                        return (
                                            <div
                                                key={photo.id}
                                                style={{
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--border-primary)',
                                                    background: 'var(--bg-secondary)',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column'
                                                }}
                                            >
                                                {pdf ? (
                                                    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', flex: 1 }}>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <FileText size={28} color="var(--red-primary, #ef4444)" />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                                                {photo.name}
                                                            </div>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: '2px', display: 'inline-block' }}>
                                                                Document PDF
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        style={{ height: '160px', width: '100%', background: '#000', cursor: 'pointer', overflow: 'hidden' }}
                                                        onClick={() => setActiveLightboxImage(fileUrl)}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={fileUrl}
                                                            alt={photo.name}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-primary)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center' }}>
                                                    <a
                                                        href={fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-secondary"
                                                        style={{ width: '100%', justifyContent: 'center', gap: '6px', fontSize: '0.8125rem', padding: '6px 12px' }}
                                                    >
                                                        <Download size={14} /> {pdf ? 'Afficher / Télécharger PDF' : 'Ouvrir en grand'}
                                                    </a>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox photo en plein écran */}
            {activeLightboxImage && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out'
                    }}
                    onClick={() => setActiveLightboxImage(null)}
                >
                    <button
                        onClick={() => setActiveLightboxImage(null)}
                        style={{
                            position: 'absolute',
                            top: 20, right: 20,
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: 32,
                            cursor: 'pointer',
                            padding: 10
                        }}
                    >
                        ✕
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={activeLightboxImage}
                        alt="Aperçu justificatif"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            objectFit: 'contain'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
