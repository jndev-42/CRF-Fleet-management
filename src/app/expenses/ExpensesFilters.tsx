interface ExpensesFiltersProps {
    isManager: boolean;
    viewScope: 'ul' | 'my';
    setViewScope: (scope: 'ul' | 'my') => void;
    includeProcessed: boolean;
    setIncludeProcessed: (value: boolean) => void;
}

export default function ExpensesFilters({
    isManager,
    viewScope,
    setViewScope,
    includeProcessed,
    setIncludeProcessed,
}: ExpensesFiltersProps) {
    return (
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
            <div className="expense-scope-tabs">
                <button
                    type="button"
                    onClick={() => setViewScope('ul')}
                    className="expense-scope-btn"
                    style={{
                        background: viewScope === 'ul' ? 'var(--crf-red)' : 'transparent',
                        color: viewScope === 'ul' ? '#ffffff' : 'var(--text-secondary)',
                    }}
                >
                    {isManager ? 'Notes à traiter (UL)' : 'Notes en attente de paiement'}
                </button>
                <button
                    type="button"
                    onClick={() => setViewScope('my')}
                    className="expense-scope-btn"
                    style={{
                        background: viewScope === 'my' ? 'var(--crf-red)' : 'transparent',
                        color: viewScope === 'my' ? '#ffffff' : 'var(--text-secondary)',
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
    );
}
