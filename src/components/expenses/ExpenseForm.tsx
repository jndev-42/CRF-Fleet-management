'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash, Save, Send, AlertTriangle } from 'lucide-react';
import PhotoPicker from '@/components/ui/PhotoPicker';

interface ExpenseItem {
    label: string;
    amount: string; // Keep as string for input editing ease
}

interface ExpenseFormProps {
    onClose: () => void;
    onSuccess: () => void;
    initialData?: {
        id: string;
        imputation?: 'DLUS' | 'DLAS' | 'UL' | 'Autre';
        customImputation?: string | null;
        requestRefund: boolean;
        noReceiptDeclaration: boolean;
        driveFolderId: string | null;
        items: { label: string; amount: number }[];
    };
}

export default function ExpenseForm({ onClose, onSuccess, initialData }: ExpenseFormProps) {
    const [items, setItems] = useState<ExpenseItem[]>(
        initialData
            ? initialData.items.map(item => ({ label: item.label, amount: item.amount.toString() }))
            : [{ label: '', amount: '' }]
    );
    const [imputation, setImputation] = useState<'DLUS' | 'DLAS' | 'UL' | 'Autre'>(
        initialData?.imputation || 'DLUS'
    );
    const [customImputation, setCustomImputation] = useState<string>(
        initialData?.customImputation || ''
    );
    const [requestRefund, setRequestRefund] = useState(
        initialData ? initialData.requestRefund : true
    );
    const [certified, setCertified] = useState(
        initialData ? initialData.noReceiptDeclaration : false
    );
    const [submitCertified, setSubmitCertified] = useState(false);
    const [photos, setPhotos] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Calculate total whenever items change
    const [total, setTotal] = useState(0);
    useEffect(() => {
        const sum = items.reduce((acc, item) => {
            const val = parseFloat(item.amount);
            return acc + (isNaN(val) ? 0 : val);
        }, 0);
        setTotal(sum);
    }, [items]);

    const handleAddItem = () => {
        setItems(prev => [...prev, { label: '', amount: '' }]);
    };

    const handleRemoveItem = (index: number) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, field: keyof ExpenseItem, value: string) => {
        setItems(prev => prev.map((item, i) => {
            if (i === index) {
                if (field === 'amount') {
                    // Prevent typing non-numeric values (except dot/comma for decimals)
                    const sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    return { ...item, [field]: sanitized };
                }
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleSubmit = async (submitStatus: 'brouillon' | 'soumis') => {
        setError(null);

        // 1. Validation
        const validItems = items.filter(item => item.label.trim() && parseFloat(item.amount) > 0);
        if (validItems.length === 0) {
            setError('Veuillez ajouter au moins une dépense valide avec un libellé et un montant supérieur à 0.');
            return;
        }

        if (imputation === 'Autre' && !customImputation.trim()) {
            setError('Veuillez spécifier l\'imputation dans le champ texte dédié.');
            return;
        }

        if (submitStatus === 'soumis' && !submitCertified) {
            setError('Veuillez cocher la case certifiant l\'exactitude des informations et signant électroniquement la demande.');
            return;
        }

        if (requestRefund) {
            if (photos.length === 0 && !certified && !initialData?.driveFolderId) {
                setError('Veuillez soit ajouter au moins un justificatif (photo), soit cocher la déclaration sur l\'honneur.');
                return;
            }
        }

        setLoading(true);

        try {
            let driveFolderId = initialData?.driveFolderId || null;

            // 2. Upload photos to Drive if there are any
            if (requestRefund && photos.length > 0) {
                const fd = new FormData();
                photos.forEach(file => {
                    fd.append('files', file);
                });
                if (driveFolderId) {
                    fd.append('folderId', driveFolderId);
                }

                const uploadRes = await fetch('/api/expenses/upload', {
                    method: 'POST',
                    body: fd,
                });

                if (!uploadRes.ok) {
                    const errData = await uploadRes.json();
                    throw new Error(errData.error || 'Erreur lors de l\'envoi des justificatifs sur Google Drive.');
                }

                const uploadData = await uploadRes.json();
                driveFolderId = uploadData.folderId;
            }

            // 3. Create or Update Expense Report in Database
            if (initialData) {
                const payload = {
                    action: submitStatus === 'soumis' ? 'submit' : 'update',
                    status: submitStatus,
                    imputation: imputation,
                    customImputation: imputation === 'Autre' ? customImputation.trim() : null,
                    requestRefund: requestRefund,
                    noReceiptDeclaration: requestRefund && photos.length === 0 && !driveFolderId ? certified : false,
                    driveFolderId: driveFolderId,
                    items: validItems.map(item => ({
                        label: item.label.trim(),
                        amount: parseFloat(item.amount)
                    }))
                };

                const response = await fetch(`/api/expenses/${initialData.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Erreur lors de la mise à jour de la note de frais.');
                }
            } else {
                const payload = {
                    status: submitStatus,
                    imputation: imputation,
                    customImputation: imputation === 'Autre' ? customImputation.trim() : null,
                    requestRefund: requestRefund,
                    noReceiptDeclaration: requestRefund && photos.length === 0 ? certified : false,
                    driveFolderId: driveFolderId,
                    items: validItems.map(item => ({
                        label: item.label.trim(),
                        amount: parseFloat(item.amount)
                    }))
                };

                const response = await fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Erreur lors de la création de la note de frais.');
                }
            }

            onSuccess();
        } catch (e: unknown) {
            const err = e as Error;
            setError(err.message || 'Une erreur inattendue est survenue.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            padding: '24px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            maxWidth: '650px',
            margin: '0 auto'
        }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {initialData ? 'Modifier la note de frais' : 'Nouvelle note de frais'}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {initialData ? 'Mettez à jour les détails de votre brouillon.' : 'Remplissez les détails des dépenses encourues.'}
                </p>
            </div>

            {error && (
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--red-primary, #ef4444)',
                    fontSize: '0.875rem'
                }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>{error}</div>
                </div>
            )}

            {/* Imputation de la dépense */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Imputation de la dépense</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select
                        className="form-input"
                        style={{ flex: 1 }}
                        value={imputation}
                        onChange={(e) => setImputation(e.target.value as 'DLUS' | 'DLAS' | 'UL' | 'Autre')}
                        disabled={loading}
                    >
                        <option value="DLUS">DLUS</option>
                        <option value="DLAS">DLAS</option>
                        <option value="UL">UL</option>
                        <option value="Autre">Autre</option>
                    </select>
                    {imputation === 'Autre' && (
                        <input
                            type="text"
                            className="form-input"
                            style={{ flex: 1.5 }}
                            placeholder="Précisez l'imputation..."
                            value={customImputation}
                            onChange={(e) => setCustomImputation(e.target.value)}
                            disabled={loading}
                            required
                        />
                    )}
                </div>
            </div>

            {/* Dépenses */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Dépenses</label>
                    <button
                        type="button"
                        onClick={handleAddItem}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8125rem', gap: '4px' }}
                    >
                        <Plus size={14} /> Ajouter une ligne
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <input
                                type="text"
                                className="form-input"
                                style={{ flex: 3 }}
                                placeholder="Description (ex: Essence, Billet de train...)"
                                value={item.label}
                                onChange={e => handleItemChange(idx, 'label', e.target.value)}
                                disabled={loading}
                                required
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    style={{ textAlign: 'right' }}
                                    placeholder="0.00"
                                    value={item.amount}
                                    onChange={e => handleItemChange(idx, 'amount', e.target.value)}
                                    disabled={loading}
                                    required
                                />
                                <span style={{ color: 'var(--text-secondary)' }}>€</span>
                            </div>
                            <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '8px 12px', visibility: items.length > 1 ? 'visible' : 'hidden' }}
                                onClick={() => handleRemoveItem(idx)}
                                disabled={loading}
                                aria-label="Supprimer la dépense"
                            >
                                <Trash size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Total Block */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
            }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Total</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {total.toFixed(2)} €
                </span>
            </div>

            {/* Toggle Remboursement */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Demande de remboursement</span>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            Activez pour demander la restitution de ces frais.
                        </p>
                    </div>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                        <input
                            type="checkbox"
                            checked={requestRefund}
                            onChange={(e) => setRequestRefund(e.target.checked)}
                            disabled={loading}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                            position: 'absolute',
                            cursor: 'pointer',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: requestRefund ? 'var(--red-primary, #ef4444)' : 'var(--border-primary)',
                            borderRadius: '24px',
                            transition: '0.3s'
                        }}>
                            <span style={{
                                position: 'absolute',
                                content: '""',
                                height: '18px', width: '18px',
                                left: requestRefund ? '26px' : '4px',
                                bottom: '3px',
                                backgroundColor: 'white',
                                borderRadius: '50%',
                                transition: '0.3s'
                            }} />
                        </span>
                    </label>
                </div>

                {requestRefund && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px', borderTop: '1px solid var(--border-primary)', paddingTop: '16px' }}>
                        {/* Justificatifs */}
                        <PhotoPicker
                            photos={photos}
                            onPhotosChange={setPhotos}
                            label="Photos des justificatifs"
                            hint="Prenez ou importez des photos des reçus."
                            maxFiles={5}
                        />

                        {/* Déclaration sur l'honneur si pas de justificatifs */}
                        {photos.length === 0 && (
                            <label style={{
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'flex-start',
                                padding: '12px',
                                background: 'rgba(234, 179, 8, 0.08)',
                                border: '1px dashed rgba(234, 179, 8, 0.3)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '0.8125rem',
                                color: 'var(--text-primary)'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={certified}
                                    onChange={(e) => setCertified(e.target.checked)}
                                    disabled={loading}
                                    style={{ marginTop: '3px' }}
                                    required
                                />
                                <span>
                                    {"Je n'ai pas de justificatifs, je certifie sur l'honneur que les dépenses pour lesquelles je demande un remboursement ont bien été contractées dans le cadre d'une activité croix rouge."}
                                </span>
                            </label>
                        )}
                    </div>
                )}
            </div>

            {/* Signature électronique obligatoire pour la soumission */}
            <label style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '12px 14px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                color: 'var(--text-primary)',
                fontWeight: 500
            }}>
                <input
                    type="checkbox"
                    checked={submitCertified}
                    onChange={(e) => setSubmitCertified(e.target.checked)}
                    disabled={loading}
                    style={{ marginTop: '2px' }}
                />
                <span>
                    {"Je certifie l'exactitude des informations ci-dessus et signe electroniquement cette demande"}
                </span>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-secondary"
                    disabled={loading}
                >
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={() => handleSubmit('brouillon')}
                    className="btn btn-secondary"
                    style={{ gap: '6px' }}
                    disabled={loading}
                >
                    <Save size={16} /> Enregistrer Brouillon
                </button>
                <button
                    type="button"
                    onClick={() => handleSubmit('soumis')}
                    className="btn btn-primary"
                    style={{ gap: '6px' }}
                    disabled={loading}
                >
                    <Send size={16} /> Soumettre
                </button>
            </div>
        </div>
    );
}
