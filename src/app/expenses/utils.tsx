import { CheckCircle, Clock, XCircle } from 'lucide-react';
import type { ExpenseReport } from './types';

export function isPdfItem(item: { name: string; mimeType?: string }) {
    return item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
}

export function formatDate(isoString: string) {
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
}

export function getStatusBadge(status: ExpenseReport['status']) {
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
}
