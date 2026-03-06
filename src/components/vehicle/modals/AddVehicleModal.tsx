import React, { useState } from 'react';

interface AddVehicleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddVehicleModal({ isOpen, onClose, onSuccess }: AddVehicleModalProps) {
    const [form, setForm] = useState({
        name: '',
        type: 'VL',
        plate: '',
        parkingSpotSelection: "Baigneur (devant l\u2019UL)",
        parkingSpotCustom: '',
        fuelLevel: 100,
        mileage: 0,
        fuelType: 'Essence',
        vin: '',
        hasDSA: false,
        notes: '',
    });
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const finalParkingSpot = form.parkingSpotSelection === 'Autre'
            ? form.parkingSpotCustom
            : form.parkingSpotSelection;

        try {
            const res = await fetch('/api/vehicles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    type: form.type,
                    plate: form.plate,
                    parkingSpot: finalParkingSpot,
                    fuelLevel: Number(form.fuelLevel),
                    mileage: Number(form.mileage),
                    fuelType: form.fuelType,
                    vin: form.vin.trim() || undefined,
                    hasDSA: form.hasDSA,
                    notes: form.notes || undefined,
                }),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la création');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Ajouter un véhicule</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Nom du véhicule * (ex: VL186)</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Type *</label>
                                <select
                                    className="form-select"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    <option value="VL">VL (Véhicule Léger)</option>
                                    <option value="VPSP">VPSP (Ambulance)</option>
                                    <option value="Utilitaire">Utilitaire</option>
                                    <option value="Moto">Moto</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Immatriculation *</label>
                                <input
                                    className="form-input"
                                    value={form.plate}
                                    onChange={(e) => setForm({ ...form, plate: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Lieu de stationnement habituel *</label>
                                <select
                                    className="form-select"
                                    value={form.parkingSpotSelection}
                                    onChange={(e) => setForm({ ...form, parkingSpotSelection: e.target.value })}
                                >
                                    <option value="Baigneur (devant l\u2019UL)">Baigneur (devant l&apos;UL)</option>
                                    <option value="Parking Aubervilliers">Parking Aubervilliers</option>
                                    <option value="Autre">Autre</option>
                                </select>
                                {form.parkingSpotSelection === 'Autre' && (
                                    <input
                                        style={{ marginTop: 8 }}
                                        className="form-input"
                                        placeholder="Précisez la place..."
                                        value={form.parkingSpotCustom}
                                        onChange={(e) => setForm({ ...form, parkingSpotCustom: e.target.value })}
                                        required
                                    />
                                )}
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Énergie *</label>
                                <select
                                    className="form-select"
                                    value={form.fuelType}
                                    onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
                                >
                                    <option value="Essence">Essence</option>
                                    <option value="Diesel">Diesel</option>
                                    <option value="Électrique">Électrique</option>
                                    <option value="Non applicable">Non applicable</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Numéro de châssis / VIN (Optionnel)
                                    <span
                                        title="Permet de récupérer automatiquement les données utiles via l'API Renault pour les véhicules connectés (kilométrage et batterie/carburant)."
                                        style={{ cursor: 'help', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}
                                    >?</span>
                                </label>
                                <input
                                    className="form-input"
                                    placeholder="ex: VF1..."
                                    value={form.vin}
                                    onChange={(e) => setForm({ ...form, vin: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Kilométrage initial *</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={form.mileage}
                                    onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || 0 })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Niveau de carburant/batterie (%) *</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className="form-input"
                                    value={form.fuelLevel}
                                    onChange={(e) => setForm({ ...form, fuelLevel: parseInt(e.target.value) || 0 })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={form.hasDSA}
                                    onChange={(e) => setForm({ ...form, hasDSA: e.target.checked })}
                                    style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                                />
                                <span style={{ fontSize: 14, fontWeight: 500 }}>🫀 Le véhicule est équipé d&apos;un DSA</span>
                            </label>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Notes (Optionnel)</label>
                            <textarea
                                className="form-textarea"
                                rows={3}
                                placeholder="Informations supplémentaires..."
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : 'Créer le véhicule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
