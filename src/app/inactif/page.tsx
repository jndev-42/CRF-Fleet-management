'use client';

import { signOut } from 'next-auth/react';

export default function InactifPage() {
    return (
        <div className="empty-state" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="empty-state-icon">🔒</div>
            <div className="empty-state-title">Compte inactif</div>
            <p style={{ maxWidth: 400, margin: '0 auto 24px auto', lineHeight: 1.5, color: 'var(--text-secondary)', textAlign: 'center' }}>
                Votre compte a été désactivé. Contactez un administrateur pour le réactiver.
            </p>
            <button
                className="btn btn-secondary"
                style={{ margin: '0 auto' }}
                onClick={() => signOut({ callbackUrl: '/login' })}
            >
                Se déconnecter
            </button>
        </div>
    );
}
