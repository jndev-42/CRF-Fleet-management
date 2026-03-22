'use client';

import { useEffect, useState } from 'react';

interface PhotoEntry {
    id: string;
    name: string;
}

interface MissionPhotosSectionProps {
    folderId: string;
}

export default function MissionPhotosSection({ folderId }: MissionPhotosSectionProps) {
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

    if (loading) {
        return (
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '0.75rem',
                }}
            >
                {[1, 2, 3].map(i => (
                    <div
                        key={i}
                        style={{
                            width: '100%',
                            aspectRatio: '1',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                        }}
                    />
                ))}
            </div>
        );
    }

    if (photos.length === 0) {
        return (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                Aucune photo disponible.
            </p>
        );
    }

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '0.75rem',
            }}
        >
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
                        }}
                    />
                </a>
            ))}
        </div>
    );
}
