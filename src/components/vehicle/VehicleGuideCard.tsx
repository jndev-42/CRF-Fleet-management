'use client';

import { useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { formatGuideSize } from '@/lib/vehicleGuide';
import VehicleGuideReader from './VehicleGuideReader';

interface VehicleGuideCardProps {
    /**
     * URL de lecture du guide : `/api/vehicles/<nom>/guide` sur la page véhicule,
     * `/api/qr/<token>/guide` sur le parcours QR.
     */
    src: string;
    fileName: string;
    size?: number | null;
    updatedAt?: string | null;
}

/**
 * Carte « Guide de vérification » : lecture plein écran dans l'appli, ou
 * téléchargement sous le nom d'origine. Le parent ne l'affiche que si le
 * véhicule a un guide.
 */
export default function VehicleGuideCard({ src, fileName, size, updatedAt }: VehicleGuideCardProps) {
    const [reading, setReading] = useState(false);

    const details = [
        formatGuideSize(size),
        updatedAt ? `mis à jour le ${new Date(updatedAt).toLocaleDateString('fr-FR')}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
            <div className="detail-card-title" style={{ marginBottom: 12 }}>Guide de vérification</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <FileText size={28} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--crf-red)' }} />
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{fileName}</div>
                    {details && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{details}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={() => setReading(true)}>
                        <BookOpen size={16} aria-hidden="true" /> Lire
                    </button>
                    <a
                        className="btn btn-secondary"
                        href={`${src}${src.includes('?') ? '&' : '?'}download=1`}
                        download={fileName}
                    >
                        <Download size={16} aria-hidden="true" /> Télécharger
                    </a>
                </div>
            </div>

            {reading && (
                <VehicleGuideReader src={src} fileName={fileName} onClose={() => setReading(false)} />
            )}
        </div>
    );
}
