'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface SignedReportLightboxProps {
    driveId: string;
    onClose: () => void;
}

export default function SignedReportLightbox({ driveId, onClose }: SignedReportLightboxProps) {
    const [isPdf, setIsPdf] = useState(false);
    const url = `/api/drive/photos/${driveId}`;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.92)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'zoom-out',
            }}
            onClick={onClose}
        >
            <button
                onClick={onClose}
                aria-label="Fermer"
                style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <X size={22} />
            </button>

            {!isPdf ? (
                /* eslint-disable-next-line @next/next/no-img-element -- proxy URL */
                <img
                    src={url}
                    alt="Rapport de mission signé"
                    onError={() => setIsPdf(true)}
                    style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', cursor: 'default', borderRadius: 4 }}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <div
                    style={{ width: '92vw', height: '92vh', cursor: 'default' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <iframe
                        src={url}
                        title="Rapport signé (PDF)"
                        style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4 }}
                    />
                </div>
            )}
        </div>
    );
}
