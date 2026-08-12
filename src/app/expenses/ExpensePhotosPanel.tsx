import { FileText, Receipt } from 'lucide-react';
import { isPdfItem } from './utils';

interface ExpensePhotosPanelProps {
    photos: { id: string; name: string; mimeType?: string }[];
    photosLoading: boolean;
    onViewAll: () => void;
}

export default function ExpensePhotosPanel({ photos, photosLoading, onViewAll }: ExpensePhotosPanelProps) {
    return (
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Receipt size={14} /> Justificatifs ({photos.length})
                </span>
                {photos.length > 0 && (
                    <button
                        type="button"
                        onClick={onViewAll}
                        style={{ background: 'none', border: 'none', color: 'var(--red-primary, #ef4444)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                        Voir tout
                    </button>
                )}
            </div>

            {photosLoading ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Chargement des justificatifs...</span>
            ) : photos.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aucun justificatif disponible.</span>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {photos.map(photo => {
                        const pdf = isPdfItem(photo);
                        if (pdf) {
                            return (
                                <a
                                    key={photo.id}
                                    href={`/api/drive/photos/${photo.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        aspectRatio: '1',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-secondary)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '4px',
                                        textDecoration: 'none',
                                        gap: '2px',
                                        textAlign: 'center'
                                    }}
                                    title={`Ouvrir/Télécharger ${photo.name}`}
                                >
                                    <FileText size={20} color="var(--red-primary, #ef4444)" />
                                    <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--text-primary)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {photo.name}
                                    </span>
                                    <span style={{ fontSize: '7px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>PDF</span>
                                </a>
                            );
                        }
                        return (
                            <a
                                key={photo.id}
                                href={`/api/drive/photos/${photo.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    aspectRatio: '1',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border-primary)',
                                    display: 'block'
                                }}
                                title={photo.name}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`/api/drive/photos/${photo.id}`}
                                    alt={photo.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
