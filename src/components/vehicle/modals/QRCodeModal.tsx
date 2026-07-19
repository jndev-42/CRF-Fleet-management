'use client';

import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { canAccessAdminPanel } from '@/lib/roles';

interface QRCodeModalProps {
    onClose: () => void;
    vehicleName: string;
    /** Internal vehicle UUID — used to fetch/create the QR bypass token */
    vehicleId: string;
    /** Current user roles — controls visibility of the Regenerate button */
    userRoles: string[];
}

export default function QRCodeModal({ onClose, vehicleName, vehicleId, userRoles }: QRCodeModalProps) {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);

    const qrUrl = token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/qr/${token}`
        : '';

    async function fetchToken() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/qr-token`, { method: 'POST' });
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
            'Régénérer le QR Code ?\n\n⚠️ L\'ancien QR Code déjà imprimé et collé dans le véhicule sera immédiatement invalidé.\n\nConfirmer ?'
        )) return;
        setRegenerating(true);
        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/qr-token`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur serveur');
            setToken(data.token);
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Erreur lors de la régénération');
        } finally {
            setRegenerating(false);
        }
    }

    useEffect(() => {
        fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vehicleId]);

    const downloadQRCode = () => {
        const originalCanvas = document.getElementById('qr-code-canvas') as HTMLCanvasElement;
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
        ctx.fillText(vehicleName, canvas.width / 2, canvas.height - padding / 2 - 10);

        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `qrcode_${vehicleName.replace(/\s+/g, '_')}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{ textAlign: 'center', maxWidth: 380 }}
            >
                <h3 style={{ marginBottom: 8, marginTop: 0 }}>QR Code — {vehicleName}</h3>

                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                    Ce QR Code permet à n&apos;importe quel utilisateur Croix-Rouge connecté d&apos;emprunter et
                    rendre <strong>{vehicleName}</strong> directement, sans restriction d&apos;UL ou de rôle.
                    <br />
                    Imprimez-le et collez-le dans le véhicule.
                </p>

                {loading && (
                    <div style={{ padding: 32, color: 'var(--text-secondary)' }}>
                        ⏳ Génération du QR Code...
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: '12px 16px', marginBottom: 20,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 8, color: '#EF4444', fontSize: 13,
                    }}>
                        {error}
                        <button
                            onClick={fetchToken}
                            style={{ marginLeft: 8, textDecoration: 'underline', cursor: 'pointer',
                                background: 'none', border: 'none', color: '#EF4444', fontSize: 13 }}
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
                                id="qr-code-canvas"
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
                            fontSize: 11, color: 'var(--text-muted)', marginBottom: 20,
                            wordBreak: 'break-all', padding: '0 8px',
                        }}>
                            {qrUrl}
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            className="btn btn-primary"
                            onClick={downloadQRCode}
                            disabled={loading || !token}
                            style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Télécharger
                        </button>
                        <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                            Fermer
                        </button>
                    </div>

                    {canAccessAdminPanel(userRoles) && (
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
