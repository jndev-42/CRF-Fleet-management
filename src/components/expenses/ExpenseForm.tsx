import React, { useState, useEffect } from 'react';
import { Plus, Trash, Save, Send, AlertTriangle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import PhotoPicker from '@/components/ui/PhotoPicker';
import YousignSignatureModal, { SignatureData } from '@/components/expenses/YousignSignatureModal';

interface ExpenseItem {
    label: string;
    amount: string; // Keep as string for input editing ease
}

interface ExpenseFormProps {
    onClose: () => void;
    onSuccess: () => void;
    initialData?: {
        id: string;
        missionName?: string | null;
        missionDate?: string | null;
        imputation?: 'DLUS' | 'DLAS' | 'UL' | 'Autre';
        customImputation?: string | null;
        requestRefund: boolean;
        noReceiptDeclaration: boolean;
        driveFolderId: string | null;
        userFunction?: string | null;
        userSignature?: string | null;
        items: { label: string; amount: number }[];
    };
}

export default function ExpenseForm({ onClose, onSuccess, initialData }: ExpenseFormProps) {
    const { data: session } = useSession();
    const [missionName, setMissionName] = useState<string>(initialData?.missionName || '');
    const [missionDate, setMissionDate] = useState<string>(initialData?.missionDate || '');
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
    const [userFunction, setUserFunction] = useState<string>(
        initialData?.userFunction || 'Bénévole local'
    );
    const [userSignature, setUserSignature] = useState<SignatureData | null>(null);
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);

    const [photos, setPhotos] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Une mission ne peut pas être datée dans le futur.
    const todayIso = new Date().toISOString().slice(0, 10);

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
                    const sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    return { ...item, [field]: sanitized };
                }
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const validateForm = (): boolean => {
        setError(null);

        if (!missionName.trim()) {
            setError('Veuillez renseigner le nom de la mission.');
            return false;
        }

        if (!missionDate) {
            setError('Veuillez renseigner la date de la mission.');
            return false;
        }

        if (missionDate > todayIso) {
            setError('La date de la mission ne peut pas être dans le futur.');
            return false;
        }

        const validItems = items.filter(item => item.label.trim() && parseFloat(item.amount) > 0);
        if (validItems.length === 0) {
            setError('Veuillez ajouter au moins une dépense valide avec un libellé et un montant supérieur à 0.');
            return false;
        }

        if (imputation === 'Autre' && !customImputation.trim()) {
            setError('Veuillez spécifier l\'imputation dans le champ texte dédié.');
            return false;
        }

        if (requestRefund && photos.length === 0 && !certified && !initialData?.driveFolderId) {
            setError('Veuillez soit ajouter au moins un justificatif (photo), soit cocher la déclaration sur l\'honneur.');
            return false;
        }

        return true;
    };

    const handleInitiateSubmit = (status: 'brouillon' | 'soumis') => {
        if (!validateForm()) return;
        if (status === 'soumis') {
            setIsSignatureModalOpen(true);
        } else {
            executeSave('brouillon', null, userFunction);
        }
    };

    const handleSignatureConfirmed = (sigData: SignatureData, funcTitle: string) => {
        setUserSignature(sigData);
        setUserFunction(funcTitle);
        setIsSignatureModalOpen(false);
        executeSave('soumis', sigData, funcTitle);
    };

    const executeSave = async (
        submitStatus: 'brouillon' | 'soumis',
        sigData: SignatureData | null,
        funcTitle: string
    ) => {
        const validItems = items.filter(item => item.label.trim() && parseFloat(item.amount) > 0);
        setLoading(true);
        setError(null);

        try {
            let driveFolderId = initialData?.driveFolderId || null;

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
                    if (uploadRes.status === 413) {
                        throw new Error('Taille des justificatifs trop importante pour le serveur (Erreur 413 Payload Too Large). Limite : 150 Mo au total (15 Mo max par fichier).');
                    }
                    const errData = await uploadRes.json().catch(() => ({}));
                    throw new Error(errData.error || 'Erreur lors de l\'envoi des justificatifs sur Google Drive.');
                }

                const uploadData = await uploadRes.json();
                driveFolderId = uploadData.folderId;
            }

            if (initialData) {
                const payload = {
                    action: submitStatus === 'soumis' ? 'submit' : 'update',
                    status: submitStatus,
                    missionName: missionName.trim(),
                    missionDate: missionDate,
                    imputation: imputation,
                    customImputation: imputation === 'Autre' ? customImputation.trim() : null,
                    requestRefund: requestRefund,
                    noReceiptDeclaration: requestRefund && photos.length === 0 && !driveFolderId ? certified : false,
                    userFunction: funcTitle,
                    userSignature: sigData || userSignature,
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
                    missionName: missionName.trim(),
                    missionDate: missionDate,
                    imputation: imputation,
                    customImputation: imputation === 'Autre' ? customImputation.trim() : null,
                    requestRefund: requestRefund,
                    noReceiptDeclaration: requestRefund && photos.length === 0 ? certified : false,
                    userFunction: funcTitle,
                    userSignature: sigData || userSignature,
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
        <div className="expense-form-card">
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
                    color: 'var(--error-text)',
                    fontSize: '0.875rem'
                }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>{error}</div>
                </div>
            )}

            {/* Mission */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="form-label" htmlFor="missionName" style={{ fontWeight: 600, margin: 0 }}>
                    Nom de la mission <span style={{ color: 'var(--crf-red)' }}>*</span>
                </label>
                <input
                    id="missionName"
                    type="text"
                    className="form-input"
                    placeholder="Ex : Maraude Nord, Poste de secours Marathon..."
                    value={missionName}
                    onChange={(e) => setMissionName(e.target.value)}
                    disabled={loading}
                    required
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="form-label" htmlFor="missionDate" style={{ fontWeight: 600, margin: 0 }}>
                    Date de la mission <span style={{ color: 'var(--crf-red)' }}>*</span>
                </label>
                <input
                    id="missionDate"
                    type="date"
                    className="form-input"
                    value={missionDate}
                    max={todayIso}
                    onChange={(e) => setMissionDate(e.target.value)}
                    disabled={loading}
                    required
                />
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Date à laquelle la mission a eu lieu.
                </p>
            </div>

            {/* Imputation de la dépense */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Imputation de la dépense</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <select
                        className="form-input"
                        style={{ flex: '1 1 140px' }}
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
                            style={{ flex: '1 1 180px' }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
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
                        <div key={idx} className="expense-item-row">
                            <input
                                type="text"
                                className="form-input expense-item-desc"
                                placeholder="Description (ex: Essence, Billet de train...)"
                                value={item.label}
                                onChange={e => handleItemChange(idx, 'label', e.target.value)}
                                disabled={loading}
                                required
                            />
                            <div className="expense-item-amount-group">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        style={{ textAlign: 'right', width: '100%', minWidth: 0 }}
                                        placeholder="0.00"
                                        value={item.amount}
                                        onChange={e => handleItemChange(idx, 'amount', e.target.value)}
                                        disabled={loading}
                                        required
                                    />
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>€</span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    style={{ padding: '8px 12px', visibility: items.length > 1 ? 'visible' : 'hidden', flexShrink: 0 }}
                                    onClick={() => handleRemoveItem(idx)}
                                    disabled={loading}
                                    aria-label="Supprimer la dépense"
                                >
                                    <Trash size={16} />
                                </button>
                            </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Demande de remboursement</span>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            Activez pour demander la restitution de ces frais.
                        </p>
                    </div>
                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', flexShrink: 0 }}>
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
                            backgroundColor: requestRefund ? 'var(--crf-red)' : 'var(--border-primary)',
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
                            label="Justificatifs (Photos ou PDF)"
                            hint="Importez des photos ou des fichiers PDF de vos reçus. Maximum 15 Mo par fichier · 150 Mo max au total."
                            accept="image/*,application/pdf"
                            maxSizeMB={15}
                            maxTotalSizeMB={150}
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

            {/* Actions */}
            <div className="expense-form-actions">
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
                    onClick={() => handleInitiateSubmit('brouillon')}
                    className="btn btn-secondary"
                    style={{ gap: '6px' }}
                    disabled={loading}
                >
                    <Save size={16} /> Enregistrer Brouillon
                </button>
                <button
                    type="button"
                    onClick={() => handleInitiateSubmit('soumis')}
                    className="btn btn-primary"
                    style={{ gap: '6px' }}
                    disabled={loading}
                >
                    <Send size={16} /> Signer et Soumettre
                </button>
            </div>

            {/* Modal de signature Yousign du demandeur */}
            <YousignSignatureModal
                isOpen={isSignatureModalOpen}
                onClose={() => setIsSignatureModalOpen(false)}
                onSign={handleSignatureConfirmed}
                signerName={session?.user?.name || 'Demandeur'}
                signerEmail={session?.user?.email || ''}
                roleTitle="Demandeur"
                initialFunction={userFunction}
                loading={loading}
            />
        </div>
    );
}
