'use client';

import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { canAccessAdminPanel } from '@/lib/roles';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './StockQRCodeModal.module.css';

interface StockQRCodeModalProps {
    onClose: () => void;
    stockName: string;
    /** Identifiant du stock — sert à obtenir ou créer le token. */
    stockId: string;
    /** Rôles de l'utilisateur — pilotent la visibilité du bouton « Régénérer ». */
    userRoles: string[];
}

/**
 * QR Code d'un stock d'inventaire, à imprimer et coller sur l'armoire.
 *
 * Adapté de `src/components/vehicle/modals/QRCodeModal.tsx`, avec deux écarts
 * délibérés :
 *  - l'id du canvas est `qr-stock-code-canvas`, DISTINCT de `qr-code-canvas` :
 *    `downloadQRCode` fait un `getElementById` global, et deux modales partageant
 *    le même id téléchargeraient le QR de l'autre ;
 *  - les erreurs de régénération s'affichent dans un encart inline au lieu d'un
 *    `alert()`.
 */
export default function StockQRCodeModal({ onClose, stockName, stockId, userRoles }: StockQRCodeModalProps) {
    useEscapeKey(onClose);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const qrUrl = token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/qr-stock/${token}`
        : '';

    async function fetchToken() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/stocks/${stockId}/qr-token`, { method: 'POST' });
            const data = await res.json();
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
            'Régénérer le QR Code ?\n\n⚠️ L\'ancien QR Code déjà imprimé et collé sur l\'armoire sera immédiatement invalidé.\n\nConfirmer ?'
        )) return;
        setRegenerating(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/stocks/${stockId}/qr-token`, { method: 'DELETE' });
            const data = await res.json();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchToken est redéfinie à chaque rendu ; seul stockId doit déclencher un refetch
    }, [stockId]);

    const downloadQRCode = () => {
        const originalCanvas = document.getElementById('qr-stock-code-canvas') as HTMLCanvasElement;
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
        ctx.fillText(stockName, canvas.width / 2, canvas.height - padding / 2 - 10);

        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `qrcode_stock_${stockName.replace(/\s+/g, '_')}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
    };

    return (
        <div className={`modal-overlay ${styles.overlay}`} onClick={onClose}>
            <div
                className={`modal-content ${styles.modal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-qr-title"
                onClick={e => e.stopPropagation()}
            >
                <h3 id="stock-qr-title" className={styles.title}>QR Code — {stockName}</h3>

                <p className={styles.intro}>
                    Ce QR Code permet à n&apos;importe quel utilisateur Croix-Rouge connecté de déclarer
                    des entrées et des sorties sur <strong>{stockName}</strong>, sans restriction d&apos;UL
                    ni de rôle. Chaque mouvement est enregistré à son nom.
                    <br />
                    Imprimez-le et collez-le sur l&apos;armoire.
                </p>

                {loading && (
                    <div className={styles.loadingBox}>
                        ⏳ Génération du QR Code...
                    </div>
                )}

                {error && (
                    <div className={styles.errorBox} role="alert">
                        {error}
                        <button
                            onClick={fetchToken}
                            className={styles.retryBtn}
                        >
                            Réessayer
                        </button>
                    </div>
                )}

                {!loading && token && (
                    <>
                        <div className={styles.qrFrame}>
                            <QRCodeCanvas
                                id="qr-stock-code-canvas"
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

                        <div className={styles.qrUrl}>
                            {qrUrl}
                        </div>

                        <button
                            className={`btn btn-secondary ${styles.copyBtn}`}
                            onClick={() => {
                                navigator.clipboard.writeText(qrUrl).then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2500);
                                });
                            }}
                            disabled={!token}
                            style={copied ? {
                                background: 'rgba(16,185,129,0.12)',
                                borderColor: 'rgba(16,185,129,0.5)',
                                color: 'var(--status-available)',
                            } : undefined}
                        >
                            {copied ? 'Lien copié !' : 'Copier le lien du QR Code'}
                        </button>
                    </>
                )}

                <div className={styles.actions}>
                    <div className={styles.actionsRow}>
                        <button
                            className={`btn btn-primary ${styles.actionBtn}`}
                            onClick={downloadQRCode}
                            disabled={loading || !token}
                        >
                            Télécharger
                        </button>
                        <button className={`btn btn-secondary ${styles.actionBtn}`} onClick={onClose}>
                            Fermer
                        </button>
                    </div>

                    {canAccessAdminPanel(userRoles) && (
                        <button
                            className={`btn btn-secondary ${styles.regenerateBtn}`}
                            onClick={handleRegenerate}
                            disabled={loading || regenerating}
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
