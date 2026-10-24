'use client';

import { useSyncExternalStore } from 'react';
import styles from './McpTokensTab.module.css';

const noop = () => () => {};

/**
 * URL du serveur MCP et exemples de configuration des clients IA. Le jeton passe par une
 * variable d'environnement : jamais en clair dans l'historique du shell ni dans un fichier
 * de configuration susceptible d'être versionné.
 */
export default function McpClientConfig() {
    // Origine connue côté navigateur seulement ; vide au rendu serveur.
    const origin = useSyncExternalStore(noop, () => window.location.origin, () => '');
    const url = `${origin}/api/mcp`;

    const json = JSON.stringify({
        mcpServers: {
            'crf-fleet': { type: 'http', url, headers: { Authorization: 'Bearer ${CRF_MCP_TOKEN}' } },
        },
    }, null, 2);

    return (
        <div className={styles.card}>
            <h3 className={styles.cardTitle}>Connecter une IA</h3>
            <p className={styles.meta}>
                URL du serveur : <code className={styles.prefix}>{url}</code> — transport « Streamable HTTP »,
                jeton dans l&apos;en-tête <code className={styles.prefix}>Authorization: Bearer …</code>. Fonctionne avec les
                clients qui acceptent cet en-tête (Claude Code, Claude Desktop, Cursor…) ; les connecteurs web qui exigent
                OAuth (claude.ai, ChatGPT) ne sont pas pris en charge.
            </p>
            <p className={styles.meta}>1. Placez le jeton dans une variable d&apos;environnement :</p>
            <pre className={styles.code}>export CRF_MCP_TOKEN=crf_mcp_…</pre>
            <p className={styles.meta}>2. Claude Code :</p>
            <pre className={styles.code}>{`claude mcp add --transport http crf-fleet ${url} --header "Authorization: Bearer $CRF_MCP_TOKEN"`}</pre>
            <p className={styles.meta}>Ou client configuré par fichier JSON (.mcp.json de Claude Code, Cursor…) :</p>
            <pre className={styles.code}>{json}</pre>
            <p className={styles.warning}>Ne versionnez jamais le jeton : gardez-le hors de tout fichier commité.</p>
        </div>
    );
}
