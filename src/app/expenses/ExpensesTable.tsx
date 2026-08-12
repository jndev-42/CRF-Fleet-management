import { useMemo, useState } from 'react';
import { FileText, Trash, Check, Eye, X, Send, Edit, DollarSign, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { formatDate, getStatusBadge } from './utils';
import type { ExpenseReport } from './types';

type SortField = 'userName' | 'date' | 'imputation' | 'description' | 'total' | 'requestRefund' | 'status';
type SortOrder = 'asc' | 'desc';

interface ExpensesTableProps {
    reports: ExpenseReport[];
    tableLoading: boolean;
    isManager: boolean;
    isTresorier: boolean;
    canPay: boolean;
    actionLoading: string | null;
    currentUserId: string | undefined;
    selectedReportId: string | undefined;
    onSelectReport: (report: ExpenseReport) => void;
    onEditDraft: (report: ExpenseReport) => void;
    onSubmitDraft: (id: string) => void;
    onDelete: (id: string) => void;
    onOpenValidate: (report: ExpenseReport) => void;
    onReject: (id: string) => void;
    onPay: (id: string) => void;
}

export default function ExpensesTable({
    reports,
    tableLoading,
    isManager,
    isTresorier,
    canPay,
    actionLoading,
    currentUserId,
    selectedReportId,
    onSelectReport,
    onEditDraft,
    onSubmitDraft,
    onDelete,
    onOpenValidate,
    onReject,
    onPay,
}: ExpensesTableProps) {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
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
                    valA = ((a.items || []).map(i => i.label || '').join(', ')).toLowerCase();
                    valB = ((b.items || []).map(i => i.label || '').join(', ')).toLowerCase();
                    break;
                case 'total':
                    valA = a.total ?? 0;
                    valB = b.total ?? 0;
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

    return (
        <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            overflow: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
            opacity: tableLoading ? 0.6 : 1,
            transition: 'opacity 0.2s'
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
                                            background: selectedReportId === report.id ? 'var(--bg-secondary)' : 'transparent',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => onSelectReport(report)}
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
                                            {(report.items || []).map(item => item.label).join(', ')}
                                        </td>
                                        <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {(report.total ?? 0).toFixed(2)} €
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
                                                    onClick={() => onSelectReport(report)}
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
                                                {report.status === 'brouillon' && report.userId === currentUserId && (
                                                    <>
                                                        <button
                                                            onClick={() => onEditDraft(report)}
                                                            className="btn btn-secondary"
                                                            style={{ padding: '6px 10px' }}
                                                            disabled={actionLoading === report.id}
                                                            title="Modifier le brouillon"
                                                        >
                                                            <Edit size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => onSubmitDraft(report.id)}
                                                            className="btn btn-primary"
                                                            style={{ padding: '6px 10px', background: '#f97316', borderColor: '#f97316' }}
                                                            disabled={actionLoading === report.id}
                                                            title="Soumettre la note de frais"
                                                        >
                                                            <Send size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete(report.id)}
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
                                                            onClick={() => onOpenValidate(report)}
                                                            className="btn btn-primary"
                                                            style={{ padding: '6px 10px', background: '#22c55e', borderColor: '#22c55e' }}
                                                            disabled={actionLoading === report.id}
                                                            title="Valider"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => onReject(report.id)}
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
                                                        onClick={() => onPay(report.id)}
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
    );
}
