'use client';

import { Plus, Wallet } from 'lucide-react';
import { canManageExpenseBudgets } from '@/lib/roles';

interface ExpensesHeaderProps {
    userRoles: string[];
    isManager: boolean;
    isTresorier: boolean;
    showCreateButton: boolean;
    onCreate: () => void;
    onManageBudgets: () => void;
}

/** En-tête de l'écran des notes de frais : titre, sous-titre contextuel et actions. */
export default function ExpensesHeader({
    userRoles,
    isManager,
    isTresorier,
    showCreateButton,
    onCreate,
    onManageBudgets,
}: ExpensesHeaderProps) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {canManageExpenseBudgets(userRoles) && (
                    <button
                        onClick={onManageBudgets}
                        className="btn btn-secondary"
                        style={{ gap: '8px', whiteSpace: 'nowrap' }}
                    >
                        <Wallet size={16} /> Gérer les budgets
                    </button>
                )}
                {showCreateButton && (
                    <button
                        onClick={onCreate}
                        className="btn btn-primary"
                        style={{ gap: '8px', whiteSpace: 'nowrap' }}
                    >
                        <Plus size={16} /> Nouvelle note de frais
                    </button>
                )}
            </div>
        </div>
    );
}
