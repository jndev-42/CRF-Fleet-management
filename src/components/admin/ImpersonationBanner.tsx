'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UserCheck } from 'lucide-react';

export default function ImpersonationBanner() {
    const { data: session, update } = useSession();
    const router = useRouter();

    if (!session?.user?.impersonatedEmail) return null;

    const handleStopImpersonation = async () => {
        try {
            await update({ impersonateEmail: null });
            router.push('/users');
            router.refresh();
        } catch (error) {
            console.error("Erreur lors de l'arrêt de l'impersonnalisation:", error);
        }
    };

    return (
        <div style={{
            background: 'var(--error-bg, rgba(239, 68, 68, 0.1))',
            borderBottom: '1px solid var(--error-border, rgba(239, 68, 68, 0.35))',
            color: 'var(--error-text, #EF4444)',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            zIndex: 9999,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={16} />
                <span>
                    Vous êtes connecté en tant que <strong>{session.user.email}</strong> (Compte original : {session.user.originalEmail})
                </span>
            </div>
            <button
                onClick={handleStopImpersonation}
                style={{
                    background: 'var(--text-accent, #E30613)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-sm, 8px)',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)',
                }}
            >
                Retourner à mon compte
            </button>
        </div>
    );
}
