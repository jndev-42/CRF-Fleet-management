'use client';

import { useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { formatGuideSize } from '@/lib/vehicleGuide';
import type { VehicleDocumentMeta } from '@/lib/vehicleDocuments/types';
import PdfReader from '@/components/ui/PdfReader';

interface VehicleDocumentsCardProps {
    documents: VehicleDocumentMeta[];
    /**
     * URL de lecture d'un document : `/api/vehicles/<nom>/documents/<id>` sur la page
     * véhicule, `/api/qr/<token>/documents/<id>` sur le parcours QR.
     */
    documentUrl: (documentId: string) => string;
}

/**
 * Carte « Documents liés au véhicule » : pour chaque PDF, lecture plein écran dans
 * l'appli ou téléchargement sous le nom d'origine. Le parent ne l'affiche que si le
 * véhicule a au moins un document.
 */
export default function VehicleDocumentsCard({ documents, documentUrl }: VehicleDocumentsCardProps) {
    const [reading, setReading] = useState<VehicleDocumentMeta | null>(null);

    return (
        <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
            <div className="detail-card-title" style={{ marginBottom: 12 }}>Documents liés au véhicule</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {documents.map(doc => {
                    const src = documentUrl(doc.id);
                    const details = [
                        formatGuideSize(doc.size),
                        doc.createdAt ? `ajouté le ${new Date(doc.createdAt).toLocaleDateString('fr-FR')}` : null,
                    ].filter(Boolean).join(' · ');
                    return (
                        <li key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <FileText size={28} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--crf-red)' }} />
                            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{doc.fileName}</div>
                                {details && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{details}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => setReading(doc)}
                                    aria-label={`Lire ${doc.fileName}`}
                                >
                                    <BookOpen size={16} aria-hidden="true" /> Lire
                                </button>
                                <a
                                    className="btn btn-secondary"
                                    href={`${src}${src.includes('?') ? '&' : '?'}download=1`}
                                    download={doc.fileName}
                                    aria-label={`Télécharger ${doc.fileName}`}
                                >
                                    <Download size={16} aria-hidden="true" /> Télécharger
                                </a>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {reading && (
                <PdfReader src={documentUrl(reading.id)} fileName={reading.fileName} onClose={() => setReading(null)} />
            )}
        </div>
    );
}
