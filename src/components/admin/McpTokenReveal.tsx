'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './McpTokensTab.module.css';

interface McpTokenRevealProps {
    token: string;
    onDismiss: () => void;
}

/** Jeton complet, affiché une seule fois juste après sa création. */
export default function McpTokenReveal({ token, onDismiss }: McpTokenRevealProps) {
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            setCopyFailed(false);
        } catch {
            setCopied(false);
            setCopyFailed(true);
        }
    }

    return (
        <div className={styles.reveal} role="status">
            <strong>Copiez ce jeton maintenant : il ne sera plus jamais affiché.</strong>
            <div className={styles.tokenRow}>
                <code className={styles.tokenValue} aria-label="Jeton d'accès">{token}</code>
                <button type="button" className={`btn btn-secondary ${styles.inlineButton}`} onClick={() => void copy()}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    {copied ? 'Copié' : 'Copier'}
                </button>
            </div>
            {copyFailed && <p className={styles.warning} role="alert">Copie impossible : sélectionnez le jeton et copiez-le manuellement.</p>}
            <button type="button" className="btn btn-secondary" onClick={onDismiss}>J&apos;ai copié le jeton</button>
        </div>
    );
}
