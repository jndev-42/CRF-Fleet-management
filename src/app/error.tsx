'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Une erreur est survenue</div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                Quelque chose s&apos;est mal passé. Vous pouvez réessayer ou revenir au tableau de bord.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => reset()}>
                    Réessayer
                </button>
                <Link href="/" className="btn btn-secondary">
                    Retour au dashboard
                </Link>
            </div>
        </div>
    );
}
