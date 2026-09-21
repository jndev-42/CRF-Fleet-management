'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import MissionWizard from '@/components/missions/MissionWizard';

interface QRUnitLocale {
    id: string;
    name: string;
}

/**
 * Page de dépôt d'un compte rendu de mission par scan du QR code d'une UL.
 *
 * Hors app shell, mobile d'abord : elle est utilisée debout sur un poste, par
 * un bénévole qui n'a pas forcément accès à `/missions`. D'où la carte de
 * confirmation locale après envoi — PAS de redirection vers `/missions/[id]`,
 * dont la page est gardée par rôle et renverrait le scanneur à l'accueil.
 */
export default function QRUnitLocalePage() {
    const params = useParams();
    const token = params.token as string;
    const router = useRouter();
    const { data: session } = useSession();

    const [ul, setUl] = useState<QRUnitLocale | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    /** Remonte le wizard pour repartir d'un formulaire vierge (« Nouveau rapport »). */
    const [wizardKey, setWizardKey] = useState(0);

    const fetchAbortRef = useRef<AbortController | null>(null);

    const fetchUl = useCallback(async () => {
        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        setLoading(true);
        try {
            // `encodeURIComponent` : `useParams()` rend le segment DÉCODÉ — un lien
            // forgé renverrait sinon une requête same-origin vers un endpoint
            // arbitraire, cookie de session compris.
            const res = await fetch(`/api/qr-ul/${encodeURIComponent(token)}`, { signal: controller.signal });
            if (res.status === 401) {
                router.push(`/login?callbackUrl=${encodeURIComponent(`/qr-ul/${token}`)}`);
                return;
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Erreur de chargement');
                setUl(null);
                return;
            }
            setError(null);
            setUl(await res.json());
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setError('Erreur de connexion');
        } finally {
            if (fetchAbortRef.current === controller) setLoading(false);
        }
    }, [token, router]);

    useEffect(() => {
        fetchUl();
        return () => fetchAbortRef.current?.abort();
    }, [fetchUl]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 16px 48px',
            background: 'var(--bg-primary)',
        }}>
            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                <Image src="/crf-logo.svg" alt="Croix-Rouge française" width={56} height={56} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                    Compte rendu de mission
                </div>
            </div>

            <div style={{ width: '100%', maxWidth: 640 }}>
                {loading && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                        Chargement...
                    </div>
                )}

                {!loading && error && (
                    <div style={{
                        textAlign: 'center',
                        padding: 32,
                        background: 'rgba(239,68,68,0.07)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 16,
                    }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
                        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Accès impossible</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{error}</div>
                    </div>
                )}

                {!loading && !error && ul && done && (
                    <div style={{
                        textAlign: 'center',
                        padding: 40,
                        background: 'rgba(16,185,129,0.07)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: 16,
                    }}>
                        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
                        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Compte rendu envoyé !</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            Merci — votre compte rendu est bien rattaché à {ul.name}.
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setDone(false); setWizardKey(k => k + 1); }}
                        >
                            Nouveau rapport
                        </button>
                    </div>
                )}

                {!loading && !error && ul && !done && (
                    <MissionWizard
                        key={wizardKey}
                        currentUserId={session?.user?.id}
                        currentUserName={session?.user?.name ?? undefined}
                        currentUserUlName={ul.name}
                        lockedUlId={ul.id}
                        lockedUlName={ul.name}
                        submitEndpoint={`/api/qr-ul/${encodeURIComponent(token)}/mission-report`}
                        onSuccess={() => setDone(true)}
                    />
                )}
            </div>
        </div>
    );
}
