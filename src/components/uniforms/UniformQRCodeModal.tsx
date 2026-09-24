'use client';

import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface UniformQRCodeModalProps {
    onClose: () => void;
    /** Libellé affiché — déjà préfixé « Unité Locale » par l'appelant. */
    ulName: string;
    /**
     * Identifiant de l'UL active. L'API ne le reçoit pas (elle ne sert que le
     * token de l'UL de session) : il ne sert qu'à relancer la lecture quand
     * l'utilisateur change d'UL dans la Navbar.
     */
    ulId: string;
    /** Droit de régénérer le token, calculé par l'appelant (typiquement `canAccessAdminPanel`). */
    canRegenerate: boolean;
}

/**
 * QR Code « Uniformes » d'une Unité Locale, à imprimer et afficher au vestiaire.
 * Ouvert depuis l'onglet Gestion de `/uniforms`.
 *
 * Adapté de `src/components/missions/ULQRCodeModal.tsx` — mais un token
 * DISTINCT (`UniteLocale.uniformQrToken`) : ce QR n'ouvre pas le rapport de
 * mission, et inversement. Deux écarts délibérés avec le modèle véhicule :
 *  - l'id du canvas est `qr-uniforms-code-canvas`, DISTINCT de `qr-code-canvas` :
 *    `downloadQRCode` fait un `getElementById` global, et deux modales partageant
 *    le même id téléchargeraient le QR de l'autre ;
 *  - la visibilité du bouton « Régénérer » vient de la prop `canRegenerate`,
 *    calculée par l'appelant, plutôt que d'être déduite des rôles ici.
 */
export default function UniformQRCodeModal({ onClose, ulName, ulId, canRegenerate }: UniformQRCodeModalProps) {
    useEscapeKey(onClose);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const qrUrl = token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/qr-uniforms/${token}`
        : '';

    async function fetchToken() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/uniforms/qr-token', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erreur serveur');
            setToken(data.token);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Impossible de générer le QR Code');
        } finally {
            setLoading(false);
        }
    }

    async function handleRegenerate() {
        if (!confirm(
            'Régénérer le QR Code ?\n\n⚠️ L\'ancien QR Code déjà imprimé et affiché au vestiaire sera immédiatement invalidé.\n\nConfirmer ?'
        )) return;
        setRegenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/uniforms/qr-token', { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erreur serveur');
            setToken(data.token);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur lors de la régénération');
        } finally {
            setRegenerating(false);
        }
    }

    useEffect(() => {
        fetchToken();
    // Seul un changement d'UL active doit relancer la lecture du token.
    }, [ulId]);

    const downloadQRCode = () => {
        const originalCanvas = document.getElementById('qr-uniforms-code-canvas') as HTMLCanvasElement;
        if (!originalCanvas) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const padding = 24;
        const textHeight = 36;

        canvas.width = originalCanvas.width + padding * 2;
        canvas.height = originalCanvas.height + padding * 2 + textHeight;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(originalCanvas, padding, padding);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ulName, canvas.width / 2, canvas.height - padding / 2 - 10);

        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `qrcode_uniformes_${ulName.replace(/\s+/g, '_')}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
            <div
                className="modal-content"
                role="dialog"
                aria-modal="true"
                aria-labelledby="uniforms-qr-title"
                onClick={e => e.stopPropagation()}
                style={{ textAlign: 'center', maxWidth: 380 }}
            >
                <h3 id="uniforms-qr-title" style={{ marginBottom: 8, marginTop: 0 }}>QR Code — {ulName}</h3>

                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                    Ce QR Code permet à n&apos;importe quel utilisateur Croix-Rouge connecté d&apos;emprunter
                    les uniformes de <strong>{ulName}</strong> et de marquer lavées les pièces rendues sales,
                    sans restriction d&apos;UL ni de rôle. Chaque emprunt est enregistré à son nom.
                    <br />
                    Imprimez-le et affichez-le au vestiaire.
                </p>

                {loading && (
                    <div style={{ padding: 32, color: 'var(--text-secondary)' }}>
                        ⏳ Génération du QR Code...
                    </div>
                )}

                {error && (
                    <div role="alert" style={{
                        padding: '12px 16px', marginBottom: 20,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 8, color: 'var(--error-text)', fontSize: 13,
                    }}>
                        {error}
                        <button
                            onClick={fetchToken}
                            style={{ marginLeft: 8, textDecoration: 'underline', cursor: 'pointer',
                                background: 'none', border: 'none', color: 'var(--error-text)', fontSize: 13 }}
                        >
                            Réessayer
                        </button>
                    </div>
                )}

                {!loading && token && (
                    <>
                        <div style={{
                            background: 'white', padding: 16, borderRadius: 8,
                            display: 'inline-block', marginBottom: 16,
                        }}>
                            <QRCodeCanvas
                                id="qr-uniforms-code-canvas"
                                value={qrUrl}
                                size={200}
                                bgColor="#ffffff"
                                fgColor="#000000"
                                level="H"
                                includeMargin={false}
                                imageSettings={{
                                    src: '/crf-logo.svg',
                                    height: 48,
                                    width: 48,
                                    excavate: true,
                                }}
                            />
                        </div>

                        <div style={{
                            fontSize: 11, color: 'var(--text-muted)', marginBottom: 16,
                            wordBreak: 'break-all', padding: '0 8px',
                        }}>
                            {qrUrl}
                        </div>

                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                navigator.clipboard.writeText(qrUrl).then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2500);
                                });
                            }}
                            disabled={!token}
                            style={{
                                width: '100%',
                                marginBottom: 20,
                                fontSize: 13,
                                ...(copied ? {
                                    background: 'rgba(16,185,129,0.12)',
                                    borderColor: 'rgba(16,185,129,0.5)',
                                    color: 'var(--status-available)',
                                } : {}),
                            }}
                        >
                            {copied ? 'Lien copié !' : 'Copier le lien du QR Code'}
                        </button>
                    </>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            className="btn btn-primary"
                            onClick={downloadQRCode}
                            disabled={loading || !token}
                            style={{ flex: 1 }}
                        >
                            Télécharger
                        </button>
                        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                            Fermer
                        </button>
                    </div>

                    {canRegenerate && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleRegenerate}
                            disabled={loading || regenerating}
                            style={{ fontSize: 12, color: 'var(--text-muted)', borderColor: 'var(--border-secondary)' }}
                            title="Invalide l'ancien QR Code et génère un nouveau lien"
                        >
                            {regenerating ? '⏳ Régénération...' : '🔄 Régénérer le QR Code'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
