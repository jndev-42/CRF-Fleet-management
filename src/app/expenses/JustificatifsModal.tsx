import { FileText, Receipt, X, Download } from 'lucide-react';
import { isPdfItem } from './utils';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface JustificatifsModalProps {
    photos: { id: string; name: string; mimeType?: string }[];
    onClose: () => void;
    onImageClick: (fileUrl: string) => void;
}

export default function JustificatifsModal({ photos, onClose, onImageClick }: JustificatifsModalProps) {
    useEscapeKey(onClose);
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999, backdropFilter: 'blur(5px)' }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                        <Receipt size={20} /> Justificatifs de la note de frais ({photos.length})
                    </h2>
                    <button className="modal-close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body" style={{ padding: '20px' }}>
                    {photos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                            Aucun justificatif disponible.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                            {photos.map(photo => {
                                const pdf = isPdfItem(photo);
                                const fileUrl = `/api/drive/photos/${photo.id}`;
                                return (
                                    <div
                                        key={photo.id}
                                        style={{
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border-primary)',
                                            background: 'var(--bg-secondary)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column'
                                        }}
                                    >
                                        {pdf ? (
                                            <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', flex: 1 }}>
                                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FileText size={28} color="var(--red-primary, #ef4444)" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                                        {photo.name}
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: '2px', display: 'inline-block' }}>
                                                        Document PDF
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                style={{ height: '160px', width: '100%', background: '#000', cursor: 'pointer', overflow: 'hidden' }}
                                                onClick={() => onImageClick(fileUrl)}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={fileUrl}
                                                    alt={photo.name}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            </div>
                                        )}
                                        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-primary)', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'center' }}>
                                            <a
                                                href={fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary"
                                                style={{ width: '100%', justifyContent: 'center', gap: '6px', fontSize: '0.8125rem', padding: '6px 12px' }}
                                            >
                                                <Download size={14} /> {pdf ? 'Afficher / Télécharger PDF' : 'Ouvrir en grand'}
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
