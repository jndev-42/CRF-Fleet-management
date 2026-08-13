'use client';

import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, FileText, AlertTriangle } from 'lucide-react';
import { compressImage, compressImages } from '@/lib/imageCompression';

interface PhotoPickerProps {
    /** Multiple mode: for vehicle checkout/checkin and mission photos */
    photos?: File[];
    onPhotosChange?: (photos: File[]) => void;
    /** Single mode: for Step7SignedReport */
    file?: File | null;
    onFileChange?: (file: File | null) => void;
    
    maxFiles?: number;
    maxSizeMB?: number;
    maxTotalSizeMB?: number;
    accept?: string;
    label?: string;
    hint?: string;
    className?: string;
    onError?: (error: string | null) => void;
}

export default function PhotoPicker({
    photos,
    onPhotosChange,
    file,
    onFileChange,
    maxFiles = Infinity,
    maxSizeMB = 15,
    maxTotalSizeMB = 150,
    accept = "image/*",
    label,
    hint,
    className,
    onError,
}: PhotoPickerProps) {
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const isMultiple = !!onPhotosChange;
    const currentPhotos = photos || [];
    const canAddMore = !isMultiple || currentPhotos.length < maxFiles;
    const maxSize = maxSizeMB * 1024 * 1024;
    const maxTotalSize = maxTotalSizeMB * 1024 * 1024;

    const setErr = (msg: string | null) => {
        setErrorMessage(msg);
        onError?.(msg);
    };

    const handleFiles = async (newFiles: FileList | null) => {
        if (!newFiles || newFiles.length === 0) return;
        setErr(null);
        const incoming = Array.from(newFiles);

        // Pre-compress images in background so submit is instant
        const compressedIncoming = await compressImages(incoming);

        if (isMultiple) {
            let currentTotal = currentPhotos.reduce((acc, f) => acc + f.size, 0);
            const validFiles: File[] = [];
            const errs: string[] = [];

            for (const f of compressedIncoming) {
                if (f.size > maxSize) {
                    errs.push(`"${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse ${maxSizeMB} Mo.`);
                    continue;
                }
                if (currentTotal + f.size > maxTotalSize) {
                    errs.push(`Ajout de "${f.name}" (${(f.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite totale de ${maxTotalSizeMB} Mo.`);
                    continue;
                }
                if (maxFiles !== Infinity && currentPhotos.length + validFiles.length >= maxFiles) {
                    errs.push(`Limite de ${maxFiles} fichiers atteinte.`);
                    break;
                }
                currentTotal += f.size;
                validFiles.push(f);
            }

            if (errs.length > 0) {
                setErr(errs.join(' '));
            }

            if (validFiles.length > 0) {
                const combined = [...currentPhotos, ...validFiles];
                onPhotosChange?.(combined);
            }
        } else {
            const rawSelected = compressedIncoming[0];
            if (rawSelected) {
                const selected = await compressImage(rawSelected);
                if (selected.size > maxSize) {
                    setErr(`Le fichier "${selected.name}" (${(selected.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite de ${maxSizeMB} Mo par fichier.`);
                    return;
                }
                if (selected.size > maxTotalSize) {
                    setErr(`Le fichier "${selected.name}" (${(selected.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite totale de ${maxTotalSizeMB} Mo.`);
                    return;
                }
                onFileChange?.(selected);
            }
        }

        // Reset inputs to allow selecting same file again
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const removePhoto = (index: number) => {
        setErr(null);
        if (isMultiple) {
            const updated = currentPhotos.filter((_, i) => i !== index);
            onPhotosChange?.(updated);
        } else {
            onFileChange?.(null);
        }
    };

    const isPdfFile = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

    const totalBytes = isMultiple
        ? currentPhotos.reduce((acc, p) => acc + p.size, 0)
        : (file ? file.size : 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ margin: 0 }}>{label}</label>
                    {totalBytes > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: totalBytes > maxTotalSize ? 'var(--crf-red)' : 'var(--text-secondary)' }}>
                            Taille totale : {totalMB} Mo / {maxTotalSizeMB} Mo
                        </span>
                    )}
                </div>
            )}
            
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

            {errorMessage && (
                <div
                    role="alert"
                    style={{
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        color: 'var(--crf-red)',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: 500 }}>{errorMessage}</span>
                    <button
                        type="button"
                        onClick={() => setErr(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--crf-red)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: 0,
                            lineHeight: 1,
                        }}
                        aria-label="Fermer l'erreur"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Preview for multiple mode */}
            {isMultiple && currentPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {currentPhotos.map((p, i) => (
                        <div key={i} style={{ position: 'relative', width: '75px', height: '75px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                            {isPdfFile(p) ? (
                                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', gap: '2px', textAlign: 'center' }}>
                                    <FileText size={22} color="var(--crf-red)" />
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
                             <FileText size={24} color="var(--crf-red)" />
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

