'use client';

import { useEffect, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface PhotoEntry {
    id: string;
    name: string;
}

interface MissionPhotosModalProps {
    folderId: string;
    onClose: () => void;
}

export default function MissionPhotosModal({ folderId, onClose }: MissionPhotosModalProps) {
    useEscapeKey(onClose);
    const [photos, setPhotos] = useState<PhotoEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPhotos() {
            try {
                const res = await fetch(`/api/drive/photos?folderId=${encodeURIComponent(folderId)}&flat=true`);
                if (res.ok) {
                    const data = await res.json();
                    setPhotos(data.photos ?? []);
                }
            } catch (e) {
                console.error('Erreur chargement photos mission', e);
            } finally {
                setLoading(false);
            }
        }
        fetchPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folderId is stable
    }, []);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ maxWidth: 800 }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Camera size={20} />
                        Photos de communication
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer">
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '1.25rem 1.25rem 1.5rem' }}>
                    {loading && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div
                                    key={i}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '1',
                                        borderRadius: 8,
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-primary)',
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {!loading && photos.length === 0 && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                            Aucune photo disponible.
                        </p>
                    )}

                    {!loading && photos.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                            {photos.map(photo => (
                                <a
                                    key={photo.id}
                                    href={`/api/drive/photos/${photo.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={photo.name}
                                    style={{ display: 'block', borderRadius: 8, overflow: 'hidden' }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={`/api/drive/photos/${photo.id}`}
                                        alt={photo.name}
                                        style={{
                                            width: '100%',
                                            aspectRatio: '1',
                                            objectFit: 'cover',
                                            display: 'block',
                                            border: '1px solid var(--border-primary)',
                                            borderRadius: 8,
                                            transition: 'opacity 0.15s',
                                        }}
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
