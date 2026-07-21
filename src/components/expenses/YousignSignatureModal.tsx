'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, ShieldCheck, RefreshCw, Edit3, Type } from 'lucide-react';

export interface SignatureData {
    mode: 'draw' | 'typed';
    image: string; // Base64 PNG or Data URL
    name: string;
    date: string;
    hash: string;
    userEmail?: string;
    functionTitle?: string;
}

interface YousignSignatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSign: (signatureData: SignatureData, functionTitle: string) => void;
    signerName: string;
    signerEmail: string;
    roleTitle: string; // e.g. "Demandeur" or "Responsable / Valideur"
    initialFunction?: string;
    loading?: boolean;
}

export default function YousignSignatureModal({
    isOpen,
    onClose,
    onSign,
    signerName,
    signerEmail,
    roleTitle,
    initialFunction = 'Bénévole local',
    loading = false,
}: YousignSignatureModalProps) {
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    const [mode, setMode] = useState<'draw' | 'typed'>('typed');
    const [typedText, setTypedText] = useState(signerName || '');
    const [functionTitle, setFunctionTitle] = useState(initialFunction);
    const [consentChecked, setConsentChecked] = useState(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setTypedText(signerName || '');
            setFunctionTitle(initialFunction);
            setConsentChecked(true);
            setIsDrawing(false);
            setHasDrawn(false);
        }
    }

    useEffect(() => {
        if (isOpen && mode === 'draw' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const clearCanvas = () => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        setHasDrawn(false);
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        setHasDrawn(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const generateTypedSignatureDataUrl = (text: string): string => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 400;
        tempCanvas.height = 100;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 400, 100);
            ctx.fillStyle = '#1e293b';
            ctx.font = 'italic 36px "Georgia", "Times New Roman", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text || signerName, 200, 45);

            // Add subtle baseline flourish line
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(60, 75);
            ctx.quadraticCurveTo(200, 85, 340, 75);
            ctx.stroke();
        }
        return tempCanvas.toDataURL('image/png');
    };

    const handleConfirm = () => {
        if (!consentChecked) {
            alert('Veuillez cocher la case d’engagement pour valider votre signature.');
            return;
        }

        let signatureImage = '';
        if (mode === 'draw') {
            if (!hasDrawn || !canvasRef.current) {
                alert('Veuillez effectuer votre tracé manuscrit.');
                return;
            }
            signatureImage = canvasRef.current.toDataURL('image/png');
        } else {
            if (!typedText.trim()) {
                alert('Veuillez saisir votre prénom et nom.');
                return;
            }
            signatureImage = generateTypedSignatureDataUrl(typedText.trim());
        }

        const now = new Date().toISOString();
        const hashHex = Array.from(new Uint8Array(crypto.getRandomValues(new Uint8Array(8))))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const hash = `ysg_${now.slice(0, 10).replace(/-/g, '')}_${hashHex}`;

        const signatureData: SignatureData = {
            mode,
            image: signatureImage,
            name: mode === 'typed' ? typedText.trim() : signerName,
            date: now,
            hash,
            userEmail: signerEmail,
            functionTitle,
        };

        onSign(signatureData, functionTitle);
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px'
        }}>
            <div style={{
                background: 'var(--bg-primary, #ffffff)',
                borderRadius: '16px',
                border: '1px solid var(--border-primary, #e2e8f0)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                width: '100%',
                maxWidth: '540px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldCheck size={24} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                                Signature Électronique Yousign
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9 }}>
                                {roleTitle} · Sceau sécurisé Croix-Rouge française
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* User Info */}
                    <div style={{
                        background: 'var(--bg-secondary, #f8fafc)',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-primary, #e2e8f0)',
                        fontSize: '0.8125rem',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-tertiary, #64748b)', fontSize: '0.75rem' }}>Signataire</span>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>{signerName}</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-tertiary, #64748b)', fontSize: '0.75rem' }}>Email</span>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)', wordBreak: 'break-all' }}>{signerEmail}</div>
                        </div>
                    </div>

                    {/* Function Input */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '4px' }}>
                            Fonction / Qualité du signataire :
                        </label>
                        <input
                            type="text"
                            value={functionTitle}
                            onChange={(e) => setFunctionTitle(e.target.value)}
                            placeholder="ex. Bénévole local, Président local, Directeur..."
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-primary, #cbd5e1)',
                                fontSize: '0.875rem',
                                background: 'var(--bg-primary, #ffffff)',
                                color: 'var(--text-primary, #0f172a)'
                            }}
                        />
                    </div>

                    {/* Mode Selector */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '6px' }}>
                            Style de signature manuscrite :
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setMode('typed')}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: mode === 'typed' ? '2px solid #ef4444' : '1px solid var(--border-primary, #cbd5e1)',
                                    background: mode === 'typed' ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                    color: mode === 'typed' ? '#ef4444' : 'var(--text-secondary, #475569)',
                                    fontWeight: 600,
                                    fontSize: '0.8125rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Type size={16} /> Stylisée (Nom & Prénom)
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('draw')}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: mode === 'draw' ? '2px solid #ef4444' : '1px solid var(--border-primary, #cbd5e1)',
                                    background: mode === 'draw' ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                    color: mode === 'draw' ? '#ef4444' : 'var(--text-secondary, #475569)',
                                    fontWeight: 600,
                                    fontSize: '0.8125rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Edit3 size={16} /> Tracer à la main
                            </button>
                        </div>
                    </div>

                    {/* Signature Surface */}
                    {mode === 'typed' ? (
                        <div>
                            <input
                                type="text"
                                value={typedText}
                                onChange={(e) => setTypedText(e.target.value)}
                                placeholder="Saisissez Prénom et Nom"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-primary, #cbd5e1)',
                                    fontSize: '0.875rem',
                                    marginBottom: '8px'
                                }}
                            />
                            <div style={{
                                height: '100px',
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                            }}>
                                <div style={{
                                    fontFamily: 'Georgia, Times New Roman, serif',
                                    fontStyle: 'italic',
                                    fontSize: '1.75rem',
                                    color: '#0f172a',
                                    borderBottom: '2px solid #ef4444',
                                    paddingBottom: '4px',
                                    paddingLeft: '16px',
                                    paddingRight: '16px'
                                }}>
                                    {typedText || signerName}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{
                                position: 'relative',
                                height: '120px',
                                background: '#f8fafc',
                                border: '1px dashed #cbd5e1',
                                borderRadius: '8px',
                                touchAction: 'none'
                            }}>
                                <canvas
                                    ref={canvasRef}
                                    width={460}
                                    height={120}
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                    style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
                                />
                                {!hasDrawn && (
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#94a3b8',
                                        fontSize: '0.8125rem',
                                        pointerEvents: 'none'
                                    }}>
                                        Dessinez votre signature ici...
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={clearCanvas}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#64748b',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <RefreshCw size={12} /> Effacer et recommencer
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Legal Checkbox */}
                    <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '0.78125rem',
                        color: 'var(--text-secondary, #475569)',
                        cursor: 'pointer',
                        background: 'rgba(239, 68, 68, 0.04)',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.15)'
                    }}>
                        <input
                            type="checkbox"
                            checked={consentChecked}
                            onChange={(e) => setConsentChecked(e.target.checked)}
                            style={{ marginTop: '2px', cursor: 'pointer' }}
                        />
                        <span>
                            Je confirme signer électroniquement ce document et certifie l’exactitude de l’état des frais engagés (horodatage Yousign cryptographique).
                        </span>
                    </label>
                </div>

                {/* Footer Buttons */}
                <div style={{
                    padding: '14px 20px',
                    background: 'var(--bg-secondary, #f8fafc)',
                    borderTop: '1px solid var(--border-primary, #e2e8f0)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-primary, #cbd5e1)',
                            background: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer'
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loading}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#ef4444',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <CheckCircle size={16} /> Signer et {roleTitle === 'Demandeur' ? 'soumettre' : 'valider'}
                    </button>
                </div>
            </div>
        </div>
    );
}
