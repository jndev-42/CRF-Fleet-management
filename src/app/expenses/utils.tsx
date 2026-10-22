import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { validationStage, canSignStage, signsBothSteps, type ValidationStage } from '@/lib/expenses/workflow';
import { isPresident, isSuperAdmin } from '@/lib/roles';
import type { ExpenseReport } from './types';

/**
 * Action de validation proposée à l'utilisateur sur une note, ou `null`.
 *
 * Mêmes règles que la route PATCH : étape en attente, rôle à cette étape, et
 * jamais sur sa propre note (décision D2). `combined` : le président signe à la
 * place du responsable d'activité, et valide les deux étapes d'un coup.
 */
export function signingActionFor(
    report: Pick<ExpenseReport, 'status' | 'workflowVersion' | 'userId'>,
    userRoles: string[],
    currentUserId: string | undefined,
): { stage: ValidationStage; combined: boolean } | null {
    if (!currentUserId || report.userId === currentUserId) return null;
    const stage = validationStage(report.status, report.workflowVersion);
    if (!stage || !canSignStage(userRoles, stage)) return null;
    return { stage, combined: signsBothSteps(userRoles, stage) };
}

/**
 * Peut créer une note de frais à son nom. Un président ne le peut pas (il valide
 * celles de son UL) ; le super admin n'est jamais bloqué. Même règle que POST /api/expenses.
 */
export function canCreateExpense(userRoles: string[]): boolean {
    return !(isPresident(userRoles) && !isSuperAdmin(userRoles));
}

/** Libellé du bouton de validation selon l'action proposée. */
export function validateLabel(action: { combined: boolean }): string {
    return action.combined ? 'Signer pour le responsable et valider' : 'Valider';
}

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
        soumis: { background: 'rgba(249, 115, 22, 0.15)', color: 'var(--status-inuse)', border: '1px solid rgba(249, 115, 22, 0.3)' },
        valide_respo: { background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', border: '1px solid rgba(14, 165, 233, 0.3)' },
        en_attente_paiement: { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' },
        traité: { background: 'rgba(34, 197, 94, 0.15)', color: 'var(--status-available)', border: '1px solid rgba(34, 197, 94, 0.3)' },
        refusé: { background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-maintenance)', border: '1px solid rgba(239, 68, 68, 0.3)' }
    };

    const labels: Record<ExpenseReport['status'], string> = {
        brouillon: 'Brouillon',
        soumis: 'Soumis',
        valide_respo: 'Validée par le responsable',
        en_attente_paiement: 'En attente de paiement',
        traité: 'Traitée',
        refusé: 'Refusé'
    };

    const icons: Record<ExpenseReport['status'], React.ReactNode> = {
        brouillon: <Clock size={12} style={{ marginRight: '4px' }} />,
        soumis: <Clock size={12} style={{ marginRight: '4px' }} />,
        valide_respo: <Clock size={12} style={{ marginRight: '4px' }} />,
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
