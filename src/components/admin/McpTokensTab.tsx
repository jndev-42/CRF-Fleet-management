'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { useMcpTokens } from './useMcpTokens';
import McpTokenCreateForm from './McpTokenCreateForm';
import McpTokenReveal from './McpTokenReveal';
import McpTokensTable from './McpTokensTable';
import McpClientConfig from './McpClientConfig';
import styles from './McpTokensTab.module.css';

interface McpTokensTabProps {
    isSuperAdmin: boolean;
    showToast: (message: string, type: 'success' | 'error') => void;
}

/** Onglet ADMIN+ : jetons d'accès IA (serveur MCP) — création, affichage unique, révocation. */
export default function McpTokensTab({ isSuperAdmin, showToast }: McpTokensTabProps) {
    const { tokens, loading, error, create, revoke } = useMcpTokens();
    const [revealed, setRevealed] = useState<string | null>(null);

    async function handleRevoke(id: string, name: string) {
        if (!window.confirm(`Révoquer le jeton « ${name} » ? L'IA qui l'utilise perdra l'accès immédiatement.`)) return;
        try {
            await revoke(id);
            showToast('Jeton révoqué.', 'success');
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Révocation impossible', 'error');
        }
    }

    return (
        <section className={styles.container}>
            <p className={styles.help}>
                <Bot size={14} aria-hidden="true" />
                Un jeton permet à une IA (Claude, ChatGPT…) d&apos;utiliser l&apos;application en votre nom, avec vos droits
                et votre unité locale. Chaque modification qu&apos;elle fait apparaît dans le journal d&apos;audit avec la marque « MCP ».
            </p>

            <McpTokenCreateForm
                onCreate={async input => {
                    const token = await create(input);
                    setRevealed(token);
                    showToast('Jeton créé — copiez-le maintenant.', 'success');
                }}
                onError={message => showToast(message, 'error')}
            />

            {revealed && <McpTokenReveal token={revealed} onDismiss={() => setRevealed(null)} />}

            {error && <div className={styles.error} role="alert">{error}</div>}

            <McpTokensTable tokens={tokens} showOwner={isSuperAdmin} loading={loading} onRevoke={handleRevoke} />

            <McpClientConfig />
        </section>
    );
}
