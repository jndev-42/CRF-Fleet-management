'use client';

import { useCallback, useEffect, useState } from 'react';

export type McpScope = 'read' | 'write';

export interface McpTokenItem {
    id: string;
    userId: string;
    userEmail: string | null;
    userName: string | null;
    name: string;
    tokenPrefix: string;
    scope: McpScope;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    mine: boolean;
}

export interface CreateMcpTokenInput {
    name: string;
    scope: McpScope;
    validityDays: 30 | 90 | 365;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error || fallback;
}

/** Jetons d'accès IA : liste, création (jeton complet renvoyé une seule fois) et révocation. */
export function useMcpTokens() {
    const [tokens, setTokens] = useState<McpTokenItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/mcp-tokens', { cache: 'no-store' });
            if (!res.ok) throw new Error(await errorMessage(res, 'Chargement des jetons impossible'));
            const body = await res.json() as { tokens: McpTokenItem[] };
            setTokens(body.tokens);
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Chargement des jetons impossible');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    /** Crée un jeton et renvoie sa valeur complète, à afficher une seule fois. */
    const create = useCallback(async (input: CreateMcpTokenInput): Promise<string> => {
        const res = await fetch('/api/mcp-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await errorMessage(res, 'Création du jeton impossible'));
        const body = await res.json() as { token: string };
        await refresh();
        return body.token;
    }, [refresh]);

    const revoke = useCallback(async (id: string): Promise<void> => {
        const res = await fetch(`/api/mcp-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await errorMessage(res, 'Révocation impossible'));
        await refresh();
    }, [refresh]);

    return { tokens, loading, error, create, revoke };
}
