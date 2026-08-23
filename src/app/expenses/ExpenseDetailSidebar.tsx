import { X, XCircle, AlertCircle, Check, DollarSign, Send, Trash, Edit, Download } from 'lucide-react';
import ExpensePhotosPanel from './ExpensePhotosPanel';
import { formatDate, getStatusBadge } from './utils';
import { formatIsoDayFr } from '@/lib/utils/date';
import type { ExpenseReport } from './types';

interface ExpenseDetailSidebarProps {
    report: ExpenseReport;
    isManager: boolean;
    canPay: boolean;
    currentUserId: string | undefined;
    actionLoading: string | null;
    photos: { id: string; name: string; mimeType?: string }[];
    photosLoading: boolean;
    onClose: () => void;
    onOpenValidate: (report: ExpenseReport) => void;
    onReject: (id: string) => void;
    onPay: (id: string) => void;
    onSubmitDraft: (id: string) => void;
    onDelete: (id: string) => void;
    onEditDraft: (report: ExpenseReport) => void;
    onViewAllPhotos: () => void;
}

export default function ExpenseDetailSidebar({
    report,
    isManager,
    canPay,
    currentUserId,
    actionLoading,
    photos,
    photosLoading,
    onClose,
    onOpenValidate,
    onReject,
    onPay,
    onSubmitDraft,
    onDelete,
    onEditDraft,
    onViewAllPhotos,
}: ExpenseDetailSidebarProps) {
    return (
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
                    onClick={onClose}
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
                    {report.userName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {report.userEmail}
                </div>
            </div>

            {/* Mission */}
            {report.missionName && (
                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Mission
                    </span>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                        {report.missionName}
                    </div>
                    {report.missionDate && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            le {formatIsoDayFr(report.missionDate)}
                        </div>
                    )}
                </div>
            )}

            {/* Date, Imputation & Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Soumise le
                    </span>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                        {formatDate(report.submittedAt || report.createdAt)}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginTop: '8px' }}>
                        Imputation
                    </span>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                        {report.imputation === 'Autre' ? (report.customImputation || 'Autre') : report.imputation}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                        Statut
                    </span>
                    {getStatusBadge(report.status)}
                </div>
            </div>

            {/* Rejection comment display */}
            {report.status === 'refusé' && report.rejectionComment && (
                <div style={{
                    padding: '12px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--error-text)'
                }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <XCircle size={14} /> Motif du refus
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        {report.rejectionComment}
                    </div>
                    {report.rejectorName && (
                        <div style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-tertiary)' }}>
                            Refusée par {report.rejectorName} {report.rejectedAt ? `le ${formatDate(report.rejectedAt)}` : ''}
                        </div>
                    )}
                </div>
            )}

            {/* Validator (if validated or paid) */}
            {(report.validatedBy || report.validatorName) && (
                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Validée par
                    </span>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                        {report.validatorName || 'Administrateur'}
                    </div>
                    {report.validatedAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            le {formatDate(report.validatedAt)}
                        </div>
                    )}
                </div>
            )}

            {/* Payer details (if paid) */}
            {report.paidAt && (
                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Payée par
                    </span>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
                        {report.payerName || 'Trésorier'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        le {formatDate(report.paidAt)}
                    </div>
                </div>
            )}

            {/* Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Dépenses détaillées
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(report.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(item.amount ?? 0).toFixed(2)} €</span>
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
                    <span>{(report.total ?? 0).toFixed(2)} €</span>
                </div>
            </div>

            {/* Refund & receipt declaration */}
            <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    <strong>Remboursement :</strong> {report.requestRefund ? 'Oui, remboursement demandé.' : 'Non, aucun remboursement demandé.'}
                </div>
                {report.noReceiptDeclaration && (
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
            {report.driveFolderId && (
                <ExpensePhotosPanel photos={photos} photosLoading={photosLoading} onViewAll={onViewAllPhotos} />
            )}

            {/* Sidebar PDF Download Button */}
            {report.status !== 'brouillon' && (
                <a
                    href={`/api/expenses/${report.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}
                >
                    <Download size={16} /> Télécharger le PDF officiel
                </a>
            )}

            {/* Sidebar Action buttons */}
            {report.status === 'soumis' && isManager && (
                <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <button
                        onClick={() => onOpenValidate(report)}
                        className="btn btn-primary"
                        style={{ flex: 1, background: 'var(--status-available)', borderColor: 'var(--status-available)', gap: '6px' }}
                        disabled={actionLoading === report.id}
                    >
                        <Check size={16} /> Valider
                    </button>
                    <button
                        onClick={() => onReject(report.id)}
                        className="btn btn-danger"
                        style={{ flex: 1, gap: '6px' }}
                        disabled={actionLoading === report.id}
                    >
                        <X size={16} /> Refuser
                    </button>
                </div>
            )}

            {report.status === 'en_attente_paiement' && canPay && (
                <button
                    onClick={() => onPay(report.id)}
                    className="btn btn-primary"
                    style={{ width: '100%', background: '#3b82f6', borderColor: '#3b82f6', marginTop: '8px', gap: '6px' }}
                    disabled={actionLoading === report.id}
                >
                    <DollarSign size={16} /> Indiquer comme payée
                </button>
            )}

            {report.status === 'brouillon' && report.userId === currentUserId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => onSubmitDraft(report.id)}
                            className="btn btn-primary"
                            style={{ flex: 1, background: 'var(--status-inuse)', borderColor: 'var(--status-inuse)', gap: '6px' }}
                            disabled={actionLoading === report.id}
                        >
                            <Send size={14} /> Soumettre
                        </button>
                        <button
                            onClick={() => onDelete(report.id)}
                            className="btn btn-danger"
                            style={{ flex: 1, gap: '6px' }}
                            disabled={actionLoading === report.id}
                        >
                            <Trash size={14} /> Supprimer
                        </button>
                    </div>
                    <button
                        onClick={() => onEditDraft(report)}
                        className="btn btn-secondary"
                        style={{ width: '100%', gap: '6px' }}
                        disabled={actionLoading === report.id}
                    >
                        <Edit size={14} /> Modifier le brouillon
                    </button>
                </div>
            )}
        </div>
    );
}
