'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDemoMode } from '@/lib/contexts/DemoContext';

const CONFIRM_MESSAGE =
    'Recopier maintenant la base réelle dans la démo ?\n\n'
    + 'La démo est partagée entre tous ses utilisateurs : tous les changements faits en démo seront perdus, et elle sera indisponible pendant la copie (plusieurs minutes possibles).';

interface RefreshResponse {
    tables?: number;
    rows?: number;
    durationMs?: number;
    purged?: number | null;
    error?: string;
}

function successMessage({ tables = 0, rows = 0, durationMs = 0, purged }: RefreshResponse): string {
    const summary = `Base démo recopiée : ${tables} table(s), ${rows} ligne(s) en ${Math.round(durationMs / 1000)} s.`;
    return purged === null ? `${summary} Les fichiers de démo n'ont pas pu être vidés.` : summary;
}

/**
 * Recopie manuelle prod → démo : réservée au SUPER_ADMIN, masquée en démo. L'interface
 * ne fait que masquer : `POST /api/demo/refresh` vérifie le rôle côté serveur.
 */
export default function DemoRefreshButton() {
    const { isDemoMode, canRefreshDemo, markDemoRefreshing, refreshDemoStatus } = useDemoMode();
    const [running, setRunning] = useState(false);
    const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

    if (!canRefreshDemo || isDemoMode) return null;

    const handleClick = async () => {
        if (!window.confirm(CONFIRM_MESSAGE)) return;
        setRunning(true);
        setOutcome(null);
        markDemoRefreshing();
        try {
            const res = await fetch('/api/demo/refresh', { method: 'POST' });
            const data = (await res.json().catch(() => null)) as RefreshResponse | null;
            setOutcome(res.ok && data
                ? { ok: true, message: successMessage(data) }
                : { ok: false, message: data?.error ?? "Le serveur n'a pas répondu à temps : vérifiez l'état de la démo et réessayez dans quelques minutes." });
        } catch {
            setOutcome({ ok: false, message: "Pas de réponse du serveur : vérifiez l'état de la démo avant de relancer." });
        }
        // Succès : le bouton d'entrée apparaît. Échec : la démo devient indisponible.
        await refreshDemoStatus();
        setRunning(false);
    };

    return (
        <>
            <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClick}
                disabled={running}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
                <RefreshCw size={16} />
                {running ? 'Recopie en cours…' : 'Recopier la base démo'}
            </button>
            {outcome && (
                <p
                    role={outcome.ok ? 'status' : 'alert'}
                    style={{ fontSize: 13, margin: 0, maxWidth: 320, color: outcome.ok ? 'var(--text-secondary)' : 'var(--crf-red)' }}
                >
                    {outcome.message}
                </p>
            )}
        </>
    );
}
