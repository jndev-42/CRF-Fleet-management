'use client';

import { useEffect, useState } from 'react';

interface PhotoViewerProps {
    driveFolderId: string;
    onClose: () => void;
}

type DrivePhoto = { id: string; name: string };

export default function PhotoViewer({ driveFolderId, onClose }: PhotoViewerProps) {
    const [loading, setLoading] = useState(true);
    const [photos, setPhotos] = useState<{ emprunt: DrivePhoto[]; rendu: DrivePhoto[] }>({ emprunt: [], rendu: [] });
    const [error, setError] = useState<string | null>(null);
    const [activePhoto, setActivePhoto] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPhotos() {
            try {
                const res = await fetch(`/api/drive/photos?folderId=${driveFolderId}`);
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        throw new Error('Permissions expirées. Veuillez vous reconnecter.');
                    }
                    throw new Error('Erreur de téléchargement des photos');
                }
                const data = await res.json();
                setPhotos(data);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Erreur inconnue');
            } finally {
                setLoading(false);
            }
        }
        fetchPhotos();
    }, [driveFolderId]);

    function renderPhotoSection(title: string, list: DrivePhoto[]) {
        if (list.length === 0) return null;
        return (
            <div style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16 }}>{title} ({list.length})</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
                    {list.map(photo => (
                        <div
                            key={photo.id}
                            style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-primary)', background: '#000', height: 150, cursor: 'pointer' }}
                            onClick={() => setActivePhoto(`/api/drive/photos/${photo.id}`)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- images are
                                served through a dynamic proxy API route; next/image cannot
                                statically optimize these URLs */}
                            <img
                                src={`/api/drive/photos/${photo.id}`}
                                alt={photo.name}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                loading="lazy"
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999, backdropFilter: 'blur(5px)' }}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div className="modal-header">
                        <h2 className="modal-title">📸 Photos du trajet</h2>
                        <button className="modal-close" onClick={onClose}>✕</button>
                    </div>
                    <div className="modal-body">
                        {loading && (
                            <div className="loading-container" style={{ padding: 40 }}>
                                <div className="loading-spinner" />
                                <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14 }}>Chargement des photos depuis Google Drive...</div>
                            </div>
                        )}
                        {error && (
                            <div className="empty-state">
                                <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
                                <div className="empty-state-title" style={{ color: '#EF4444' }}>{error}</div>
                            </div>
                        )}
                        {!loading && !error && photos.emprunt.length === 0 && photos.rendu.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">📸</div>
                                <div className="empty-state-title">Aucune photo trouvée</div>
                            </div>
                        )}
                        {!loading && !error && (
                            <>
                                {renderPhotoSection('Avant départ', photos.emprunt)}
                                {renderPhotoSection('Au retour', photos.rendu)}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Fullscreen Photo Overlay */}
            {activePhoto && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out'
                    }}
                    onClick={() => setActivePhoto(null)}
                >
                    <button
                        onClick={() => setActivePhoto(null)}
                        style={{
                            position: 'absolute',
                            top: 20, right: 20,
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: 32,
                            cursor: 'pointer',
                            padding: 10
                        }}
                    >
                        ✕
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element -- proxy URL, see above */}
                    <img
                        src={activePhoto}
                        alt="Vue en plein écran"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            objectFit: 'contain'
                        }}
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
                    />
                </div>
            )}
        </>
    );
}
