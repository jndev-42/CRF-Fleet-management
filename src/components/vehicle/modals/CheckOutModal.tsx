import React, { useState, useEffect } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';

import ChecklistItems from '../ChecklistItems';

interface CheckOutModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    /** Called after the API request completes successfully */
    onSuccess: () => void;
    /** Called after the API request completes successfully (triggers data refetch) */
    onRefetch?: () => void;
}

/**
 * Modal shown when a user is checking out (taking) a vehicle.
 * Collects mission type, vehicle condition, and optional photos.
 * onSuccess is called only after the API request completes successfully.
 */
export default function CheckOutModal({ vehicle, onClose, onSuccess, onRefetch }: CheckOutModalProps) {
    const [form, setForm] = useState({
        driverName: '',
        driverEmail: '',
        secondDriverEmail: '',
        missionType: 'DPS',
        missionName: '',
        conditionOut: 'Bon état',
        parkingOut: vehicle.parkingSpot as string,
        commentsOut: '',
    });

    // Custom checklist responses
    const [checklistOut, setChecklistOut] = useState<Record<string, boolean>>({});

    const [submitting, setSubmitting] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [users, setUsers] = useState<{ name: string, email: string }[]>([]);
    const [photos, setPhotos] = useState<File[]>([]);

    useEffect(() => {
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user) {
                    setForm(f => ({
                        ...f,
                        driverName: session.user.name || '',
                        driverEmail: session.user.email || '',
                    }));
                }
            })
            .catch(console.error)
            .finally(() => setSessionLoading(false));

        fetch('/api/users')
            .then(res => res.json())
            .then(data => {
                if (data.users) setUsers(data.users);
            })
            .catch(console.error);
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        let secondDriverName = '';
        if (form.secondDriverEmail) {
            const match = users.find(u => u.email === form.secondDriverEmail);
            secondDriverName = match?.name || form.secondDriverEmail;
        }

        try {
            let driveFolderId: string | undefined = undefined;
            if (photos.length > 0) {
                const formData = new FormData();
                formData.append('vehicleName', vehicle.name);

                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const dateStr = `${year} -${month} -${day}_${hours} -${minutes} `;

                formData.append('date', dateStr);
                formData.append('stage', 'emprunt');

                photos.forEach((file) => {
                    formData.append('files', file);
                });

                const uploadRes = await fetch('/api/drive/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) {
                    const errorData = await uploadRes.json();
                    alert(`Erreur lors de l'upload des photos: ${errorData.error || uploadRes.statusText}`);
                    setSubmitting(false);
                    return;
                }

                const uploadData = await uploadRes.json();
                driveFolderId = uploadData.folderId;
            }

            const isDsaChecked = checklistOut[`dsa-checkout-${vehicle.id}`] || false;

            const res = await fetch('/api/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: vehicle.id,
                    ...form,
                    dsaChecked: isDsaChecked,
                    secondDriverName: secondDriverName || undefined,
                    secondDriverEmail: form.secondDriverEmail || undefined,
                    driveFolderId,
                    checklistOut: Object.keys(checklistOut).length > 0 ? checklistOut : undefined,
                }),
            });
            if (res.ok) {
                // API completed successfully — close modal and trigger refetch
                onSuccess();
                onRefetch?.();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(errorData.error || 'Erreur lors de la prise du véhicule');
                setSubmitting(false);
            }
        } catch {
            alert('Erreur de connexion');
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">🚗 Prendre {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                padding: 12,
                                marginBottom: 20,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <div><strong>Immatriculation :</strong> {vehicle.plate}</div>
                            <div><strong>Kilométrage :</strong> {vehicle.mileage.toLocaleString('fr-FR')} km</div>
                            <div><strong>{vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} :</strong> {vehicle.fuelLevel}%</div>
                            {vehicle.hasDSA && <div><strong>DSA :</strong> Équipé</div>}
                        </div>

                        {/* Identité */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Votre nom * <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    className="form-input"
                                    placeholder={sessionLoading ? "Chargement..." : "Prénom NOM"}
                                    value={form.driverName}
                                    readOnly
                                    required
                                    style={{
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'not-allowed'
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    className="form-input"
                                    type="email"
                                    placeholder={sessionLoading ? "Chargement..." : "pour recevoir le rapport"}
                                    value={form.driverEmail}
                                    readOnly
                                    style={{
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'not-allowed'
                                    }}
                                />
                            </div>
                        </div>

                        {/* 2nd Conducteur */}
                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label className="form-label">2ème Conducteur (Optionnel)</label>
                            <input
                                className="form-input"
                                list="users-list"
                                placeholder="Rechercher par adresse email..."
                                value={form.secondDriverEmail}
                                onChange={(e) => setForm({ ...form, secondDriverEmail: e.target.value })}
                            />
                            <datalist id="users-list">
                                {users.map(u => (
                                    <option key={u.email} value={u.email}>{u.name || u.email}</option>
                                ))}
                            </datalist>
                        </div>

                        {/* Mission */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Type de mission *</label>
                                <select
                                    className="form-select"
                                    value={form.missionType}
                                    onChange={(e) => setForm({ ...form, missionType: e.target.value })}
                                >
                                    <option value="DPS">DPS</option>
                                    <option value="PAPS">PAPS</option>
                                    <option value="Réseaux">Réseaux</option>
                                    <option value="Urgence">Urgence</option>
                                    <option value="Logistique">Logistique</option>
                                    <option value="Maraude">Maraude</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Nom de la mission</label>
                                <input
                                    className="form-input"
                                    placeholder="si applicable"
                                    value={form.missionName}
                                    onChange={(e) => setForm({ ...form, missionName: e.target.value })}
                                />
                                {vehicle.fuelType === 'Électrique' ? (
                                    <div className="form-hint">En dessous de 50%, merci de le signaler ou de recharger le véhicule</div>
                                ) : (
                                    <div className="form-hint">En dessous de 25% (1/4), le plein doit avoir été fait sinon le signaler</div>
                                )}
                            </div>
                        </div>

                        {/* État véhicule */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">État du véhicule *</label>
                                <select
                                    className="form-select"
                                    value={form.conditionOut}
                                    onChange={(e) => setForm({ ...form, conditionOut: e.target.value })}
                                >
                                    <option value="Bon état">✅ Bon état</option>
                                    <option value="Correct">👍 Correct</option>
                                    <option value="Dégradé">⚠️ Dégradé</option>
                                    <option value="Problème signalé">❌ Problème à signaler</option>
                                </select>
                            </div>
                        </div>

                        {/* Custom Checklist */}
                        <ChecklistItems
                            vehicleId={vehicle.id}
                            type="checkout"
                            responses={checklistOut}
                            onChange={setChecklistOut}
                        />

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label">Commentaires avant le poste</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Remarques sur le véhicule..."
                                value={form.commentsOut}
                                onChange={(e) => setForm({ ...form, commentsOut: e.target.value })}
                            />
                        </div>

                        {/* Photos (Optionnel) */}
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📸 Photos avant départ (Optionnel)
                                <span title="Ces photos seront envoyées sur un Google Drive. Maximum 10 Mo par photo." style={{ cursor: 'help', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>?</span>
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                capture="environment"
                                onChange={(e) => {
                                    if (e.target.files) {
                                        const newFiles = Array.from(e.target.files);
                                        const validFiles = newFiles.filter(f => {
                                            if (f.size > 10 * 1024 * 1024) {
                                                alert(`Le fichier ${f.name} dépasse 10 Mo et ne sera pas ajouté.`);
                                                return false;
                                            }
                                            return true;
                                        });
                                        setPhotos(prev => [...prev, ...validFiles]);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    background: 'var(--bg-input)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-primary)',
                                    fontSize: 14,
                                }}
                            />
                            {photos.length > 0 && (
                                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {photos.map((photo, i) => (
                                        <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={URL.createObjectURL(photo)}
                                                alt="Aperçu"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                                                style={{
                                                    position: 'absolute', top: 4, right: 4,
                                                    background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none',
                                                    borderRadius: '50%', width: 20, height: 20, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12
                                                }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'En cours...' : '🚗 Prendre le véhicule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
