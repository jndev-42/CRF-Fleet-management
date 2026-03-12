'use client';

import { QRCodeCanvas } from 'qrcode.react';

export default function QRCodeModal({ onClose, vehicleName }: { onClose: () => void, vehicleName: string }) {
    const url = typeof window !== 'undefined' ? window.location.href : '';

    const downloadQRCode = () => {
        const originalCanvas = document.getElementById("qr-code-canvas") as HTMLCanvasElement;
        if (!originalCanvas) return;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const padding = 24;
        const textHeight = 36;

        canvas.width = originalCanvas.width + (padding * 2);
        canvas.height = originalCanvas.height + (padding * 2) + textHeight;

        // Fond blanc explicite pour toute l'image externe
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dessiner le QRCode original
        ctx.drawImage(originalCanvas, padding, padding);

        // Ajouter le texte "CR Chauffeur"
        ctx.fillStyle = "#000000";
        ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Position du texte (au milieu en X, et en bas en dessous du padding)
        ctx.fillText("CR Chauffeur", canvas.width / 2, canvas.height - (padding / 2) - 10);

        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `qrcode_${vehicleName.replace(/\s+/g, '_')}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 350 }}>
                <h3 style={{ marginBottom: 12, marginTop: 0 }}>QR Code</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.4 }}>
                    Ce QR Code mène à la page de <strong>{vehicleName}</strong>.<br />
                    Vous pouvez l&apos;imprimer et le coller dans le véhicule.
                </p>
                <div style={{ background: 'white', padding: 16, borderRadius: 8, display: 'inline-block', marginBottom: 24 }}>
                    <QRCodeCanvas
                        id="qr-code-canvas"
                        value={url}
                        size={200}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"H"} // Niveau de correction H nécessaire pour incruster un logo par dessus
                        includeMargin={false}
                        imageSettings={{
                            src: "/crf-logo.svg", // Appelle de notre logo Croix-Rouge public
                            height: 48,
                            width: 48,
                            excavate: true, // "Creuse" les carrés du QR pour améliorer la lisibilité du logo
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={downloadQRCode} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Télécharger
                    </button>
                    <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}
