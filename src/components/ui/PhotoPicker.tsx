'use client';

import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, X, FileText } from 'lucide-react';

interface PhotoPickerProps {
    /** Multiple mode: for vehicle checkout/checkin and mission photos */
    photos?: File[];
    onPhotosChange?: (photos: File[]) => void;
    /** Single mode: for Step7SignedReport */
    file?: File | null;
    onFileChange?: (file: File | null) => void;
    
    maxFiles?: number;
    maxSizeMB?: number;
    accept?: string;
    label?: string;
    hint?: string;
    className?: string;
}

export default function PhotoPicker({
    photos,
    onPhotosChange,
    file,
    onFileChange,
    maxFiles = 10,
    maxSizeMB = 10,
    accept = "image/*",
    label,
    hint,
    className
}: PhotoPickerProps) {
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const isMultiple = !!onPhotosChange;
    const currentPhotos = photos || [];
    const canAddMore = !isMultiple || currentPhotos.length < maxFiles;
    const maxSize = maxSizeMB * 1024 * 1024;

    const handleFiles = (newFiles: FileList | null) => {
        if (!newFiles) return;
        const incoming = Array.from(newFiles);

        if (isMultiple) {
            const validFiles = incoming.filter(f => {
                if (f.size > maxSize) {
                    alert(`Le fichier ${f.name} dépasse ${maxSizeMB} Mo.`);
                    return false;
                }
                return true;
            });
            
            const combined = [...currentPhotos, ...validFiles].slice(0, maxFiles);
            onPhotosChange?.(combined);
        } else {
            const selected = incoming[0];
            if (selected && selected.size > maxSize) {
                alert(`Le fichier dépasse ${maxSizeMB} Mo.`);
                return;
            }
            onFileChange?.(selected || null);
        }

        // Reset inputs to allow selecting same file again
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const removePhoto = (index: number) => {
        if (isMultiple) {
            const updated = currentPhotos.filter((_, i) => i !== index);
            onPhotosChange?.(updated);
        } else {
            onFileChange?.(null);
        }
    };

    const isPdfFile = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {label && <label className="form-label">{label}</label>}
            
            {canAddMore && (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => cameraInputRef.current?.click()}
                        style={{ flex: 1, justifyContent: 'center', gap: '8px', padding: '10px' }}
                    >
                        <Camera size={18} />
                        Appareil photo
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => galleryInputRef.current?.click()}
                        style={{ flex: 1, justifyContent: 'center', gap: '8px', padding: '10px' }}
                    >
                        <ImageIcon size={18} />
                        Fichiers / Galerie
                    </button>
                </div>
            )}

            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFiles(e.target.files)}
                style={{ display: 'none' }}
            />
            <input
                ref={galleryInputRef}
                type="file"
                accept={accept}
                multiple={isMultiple}
                onChange={(e) => handleFiles(e.target.files)}
                style={{ display: 'none' }}
            />

            {hint && <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-4px' }}>{hint}</span>}

            {/* Preview for multiple mode */}
            {isMultiple && currentPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {currentPhotos.map((p, i) => (
                        <div key={i} style={{ position: 'relative', width: '75px', height: '75px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                            {isPdfFile(p) ? (
                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', gap: '2px', textAlign: 'center' }}>
                                    <FileText size={22} color="var(--red-primary, #ef4444)" />
                                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-primary)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.name}
                                    </span>
                                    <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>PDF</span>
                                </div>
                            ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={URL.createObjectURL(p)}
                                    alt="Aperçu"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            )}
                            <button
                                type="button"
                                onClick={() => removePhoto(i)}
                                style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(0,0,0,0.6)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Preview for single mode */}
            {!isMultiple && file && (
                <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                     {isPdfFile(file) ? (
                         <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', gap: '2px', textAlign: 'center' }}>
                             <FileText size={24} color="var(--red-primary, #ef4444)" />
                             <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-primary)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                 {file.name}
                             </span>
                         </div>
                     ) : file.type.startsWith('image/') ? (
                         /* eslint-disable-next-line @next/next/no-img-element */
                         <img
                            src={URL.createObjectURL(file)}
                            alt="Aperçu"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                     ) : (
                         <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
                             <X size={24} />
                         </div>
                     )}
                    <button
                        type="button"
                        onClick={() => removePhoto(0)}
                        style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0
                        }}
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
        </div>
    );
}
