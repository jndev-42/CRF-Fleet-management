'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Archive, Check, X } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

/** Budget analytique tel que renvoyé par `GET /api/expense-budgets`. */
interface Budget {
    id: string;
    name: string;
}

interface ExpenseBudgetsModalProps {
    onClose: () => void;
    /** UL ciblée. Omise, le serveur retient l'UL de session. */
    ulId?: string;
}

/**
 * Gestion des budgets analytiques d'une UL : liste, ajout, renommage, archivage.
 *
 * Les budgets archivés ne sont jamais listés et aucun libellé « (archivé) »
 * n'est affiché : l'archivage sert à conserver le nom dans les statistiques
 * historiques, pas à encombrer l'écran de gestion.
 */
export default function ExpenseBudgetsModal({ onClose, ulId }: ExpenseBudgetsModalProps) {
    useEscapeKey(onClose);

    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const editInputRef = useRef<HTMLInputElement>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    // Ramène le focus sur la ligne d'origine quand la confirmation est abandonnée.
    const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);

    const query = ulId ? `?ulId=${encodeURIComponent(ulId)}` : '';

    const loadBudgets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/expense-budgets${query}`);
            if (!res.ok) throw new Error('Impossible de charger les budgets.');
            const data = await res.json();
            setBudgets(Array.isArray(data) ? data : []);
            setError(null);
        } catch {
            setBudgets([]);
            setError('Impossible de charger les budgets.');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        loadBudgets();
    }, [loadBudgets]);

    // Le focus doit suivre le passage en mode renommage : sans cela, un
    // utilisateur au clavier reste sur un bouton qui vient de disparaître.
    useEffect(() => {
        if (editingId) editInputRef.current?.focus();
    }, [editingId]);

    useEffect(() => {
        if (confirmingId) confirmButtonRef.current?.focus();
    }, [confirmingId]);

    /** Extrait le message d'erreur français renvoyé par l'API. */
    async function readError(res: Response, fallback: string): Promise<string> {
        try {
            const data = await res.json();
            return typeof data?.error === 'string' ? data.error : fallback;
        } catch {
            return fallback;
        }
    }

    async function handleCreate() {
        if (!newName.trim() || submitting) return;
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/expense-budgets${query}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!res.ok) {
                setError(await readError(res, 'Impossible de créer le budget.'));
                return;
            }
            setNewName('');
            setMessage('Budget ajouté.');
            await loadBudgets();
        } finally {
            setSubmitting(false);
        }
    }

    function startRename(budget: Budget) {
        setEditingId(budget.id);
        setEditingName(budget.name);
        setError(null);
        setMessage(null);
    }

    async function handleRename(id: string) {
        if (!editingName.trim() || submitting) return;
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/expense-budgets/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editingName.trim() }),
            });
            if (!res.ok) {
                setError(await readError(res, 'Impossible de renommer le budget.'));
                return;
            }
            setEditingId(null);
            setMessage('Budget renommé.');
            await loadBudgets();
        } finally {
            setSubmitting(false);
        }
    }

    async function handleArchive(id: string) {
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/expense-budgets/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(await readError(res, "Impossible d'archiver le budget."));
                return;
            }
            setConfirmingId(null);
            setMessage('Budget archivé.');
            await loadBudgets();
        } finally {
            setSubmitting(false);
        }
    }

    function cancelArchive() {
        setConfirmingId(null);
        archiveTriggerRef.current?.focus();
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="expense-budgets-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="expense-budgets-title" className="modal-title">Gérer les budgets</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {error && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--error-text)',
                                fontSize: '0.875rem',
                            }}>{error}</div>
                        )}
                        {message && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-secondary)',
                                fontSize: '0.875rem',
                            }}>{message}</div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="new-budget-name">Nouveau budget</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="new-budget-name"
                                className="form-input"
                                style={{ flex: 1 }}
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="Ex : Formation, Carburant..."
                                disabled={submitting}
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ gap: '6px', whiteSpace: 'nowrap' }}
                                onClick={handleCreate}
                                disabled={submitting || !newName.trim()}
                            >
                                <Plus size={16} /> Ajouter
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Chargement des budgets...</p>
                    ) : budgets.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Aucun budget pour le moment.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {budgets.map(budget => (
                                <li
                                    key={budget.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 12px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-md)',
                                    }}
                                >
                                    {editingId === budget.id ? (
                                        <>
                                            <input
                                                ref={editInputRef}
                                                className="form-input"
                                                style={{ flex: 1 }}
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                aria-label={`Renommer le budget ${budget.name}`}
                                                disabled={submitting}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() => handleRename(budget.id)}
                                                disabled={submitting || !editingName.trim()}
                                                aria-label="Confirmer le renommage"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() => setEditingId(null)}
                                                disabled={submitting}
                                                aria-label="Annuler le renommage"
                                            >
                                                <X size={16} />
                                            </button>
                                        </>
                                    ) : confirmingId === budget.id ? (
                                        <>
                                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                                                Archiver « {budget.name} » ?
                                            </span>
                                            <button
                                                ref={confirmButtonRef}
                                                type="button"
                                                className="btn btn-danger"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() => handleArchive(budget.id)}
                                                disabled={submitting}
                                            >
                                                Confirmer
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '6px 10px' }}
                                                onClick={cancelArchive}
                                                disabled={submitting}
                                            >
                                                Annuler
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{budget.name}</span>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ padding: '6px 10px' }}
                                                onClick={() => startRename(budget)}
                                                disabled={submitting}
                                                aria-label={`Renommer ${budget.name}`}
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                style={{ padding: '6px 10px' }}
                                                onClick={e => {
                                                    archiveTriggerRef.current = e.currentTarget;
                                                    setConfirmingId(budget.id);
                                                    setError(null);
                                                    setMessage(null);
                                                }}
                                                disabled={submitting}
                                                aria-label={`Archiver ${budget.name}`}
                                            >
                                                <Archive size={16} />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
