'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { CreateMcpTokenInput, McpScope } from './useMcpTokens';
import styles from './McpTokensTab.module.css';

interface McpTokenCreateFormProps {
    onCreate: (input: CreateMcpTokenInput) => Promise<void>;
    onError: (message: string) => void;
}

const VALIDITY_OPTIONS: { value: CreateMcpTokenInput['validityDays']; label: string }[] = [
    { value: 30, label: '30 jours' },
    { value: 90, label: '90 jours' },
    { value: 365, label: '1 an' },
];

/** Formulaire de création d'un jeton : nom, portée, validité. Le jeton est toujours pour soi-même. */
export default function McpTokenCreateForm({ onCreate, onError }: McpTokenCreateFormProps) {
    const [name, setName] = useState('');
    const [scope, setScope] = useState<McpScope>('read');
    const [validityDays, setValidityDays] = useState<CreateMcpTokenInput['validityDays']>(90);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            await onCreate({ name: name.trim(), scope, validityDays });
            setName('');
        } catch (err: unknown) {
            onError(err instanceof Error ? err.message : 'Création du jeton impossible');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form className={styles.card} onSubmit={handleSubmit}>
            <h3 className={styles.cardTitle}>Nouveau jeton</h3>
            <div className="form-row">
                <div className="form-group">
                    <label className="form-label" htmlFor="mcp-token-name">Nom</label>
                    <input
                        id="mcp-token-name"
                        className="form-input"
                        value={name}
                        maxLength={60}
                        placeholder="ex. Claude sur mon ordinateur"
                        onChange={e => setName(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="mcp-token-scope">Portée</label>
                    <select id="mcp-token-scope" className="form-select" value={scope} onChange={e => setScope(e.target.value as McpScope)}>
                        <option value="read">Lecture seule</option>
                        <option value="write">Lecture et écriture</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="mcp-token-validity">Validité</label>
                    <select
                        id="mcp-token-validity"
                        className="form-select"
                        value={validityDays}
                        onChange={e => setValidityDays(Number(e.target.value) as CreateMcpTokenInput['validityDays'])}
                    >
                        {VALIDITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>
            {scope === 'write' && (
                <p className={styles.warning}>
                    En lecture et écriture, l&apos;IA peut modifier et supprimer des données avec vos droits.
                </p>
            )}
            <button type="submit" className={`btn btn-primary ${styles.inlineButton}`} disabled={submitting || !name.trim()}>
                <KeyRound size={14} aria-hidden="true" />
                {submitting ? 'Génération…' : 'Générer le jeton'}
            </button>
        </form>
    );
}
