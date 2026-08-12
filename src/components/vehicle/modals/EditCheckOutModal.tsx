import React, { useState, useEffect } from 'react';
import { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import UserCombobox from '@/components/ui/UserCombobox';
import FuelBar from '@/components/vehicle/FuelBar';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface EditCheckOutModalProps {
    trip: Trip;
    vehicle: Vehicle;
    onClose: () => void;
    onSuccess: () => void;
}

/**
 * Modal for ADMIN / SUPER_ADMIN to edit departure details of an active trip.
 */
export default function EditCheckOutModal({ trip, vehicle, onClose, onSuccess }: EditCheckOutModalProps) {
    useEscapeKey(onClose);
    const [form, setForm] = useState({
        driverId: trip.driverId || '',
        secondDriverId: trip.secondDriverId || '',
        missionType: trip.missionType || 'DPS',
        missionName: trip.missionName || '',
        mileageOut: trip.mileageOut ?? vehicle.mileage,
        fuelOut: trip.fuelOut ?? vehicle.fuelLevel,
        parkingOut: trip.parkingOut || vehicle.parkingSpot || '',
        conditionOut: trip.conditionOut || 'Bon état',
        cleanlinessOut: trip.cleanlinessOut || 'Propre',
        commentsOut: trip.commentsOut || '',
        dsaChecked: !!trip.dsaChecked,
    });

    const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicle.type)}`)
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => {
                if (data.users) setUsers(data.users);
            })
            .catch(console.error);
    }, [vehicle.type]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/trips/${trip.id}/checkout`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverId: form.driverId,
                    secondDriverId: form.secondDriverId || undefined,
                    missionType: form.missionType,
                    missionName: form.missionName || undefined,
                    mileageOut: Number(form.mileageOut),
                    fuelOut: Number(form.fuelOut),
                    parkingOut: form.parkingOut || undefined,
                    conditionOut: form.conditionOut,
                    cleanlinessOut: form.cleanlinessOut || undefined,
                    commentsOut: form.commentsOut || undefined,
                    dsaChecked: form.dsaChecked,
                }),
            });

            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Erreur lors de la modification des données de départ');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-edit-checkout-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-edit-checkout-title" className="modal-title">✏️ Modifier la prise de {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div
                                style={{
                                    padding: '10px 14px',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    marginBottom: 16,
                                    fontSize: 13,
                                    color: '#DC2626',
                                }}
                            >
                                {error}
                            </div>
                        )}

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
                            <strong>⚠️ Mode Administrateur :</strong> Vous modifiez les informations saisies lors de la prise du véhicule. Le kilométrage et le niveau de carburant mis à jour ajusteront automatiquement les données courantes du véhicule.
                        </div>

                        {/* Conducteurs */}
                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label className="form-label">Conducteur principal *</label>
                            <UserCombobox
                                users={users}
                                value={form.driverId}
                                onChange={id => setForm(f => ({ ...f, driverId: id }))}
                                defaultLabel="— Sélectionner un conducteur —"
                                placeholder="Rechercher..."
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label className="form-label">2ème Conducteur (Optionnel)</label>
                            <UserCombobox
                                users={users}
                                value={form.secondDriverId}
                                onChange={id => setForm(f => ({ ...f, secondDriverId: id }))}
                                defaultLabel="— Aucun —"
                                placeholder="Rechercher..."
                            />
                        </div>

                        {/* Mission */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-mission-type">Type de mission *</label>
                                <select
                                    id="edit-mission-type"
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
                                    {vehicle.type.toUpperCase().includes('VPSP') && (
                                        <option value="Désinfection">🧴 Désinfection</option>
                                    )}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-mission-name">Nom de la mission</label>
                                <input
                                    id="edit-mission-name"
                                    className="form-input"
                                    placeholder="si applicable"
                                    value={form.missionName}
                                    onChange={(e) => setForm({ ...form, missionName: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Kilométrage et Carburant */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-mileage-out">Kilométrage au départ (km) *</label>
                                <input
                                    id="edit-mileage-out"
                                    className="form-input"
                                    type="number"
                                    min={0}
                                    value={form.mileageOut}
                                    onChange={(e) => setForm({ ...form, mileageOut: Number(e.target.value) })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-fuel-out">
                                    {vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} au départ : {form.fuelOut}%
                                </label>
                                <input
                                    id="edit-fuel-out"
                                    type="range"
                                    className="fuel-slider"
                                    min={0}
                                    max={100}
                                    value={form.fuelOut}
                                    onChange={(e) => setForm({ ...form, fuelOut: Number(e.target.value) })}
                                    aria-label="Niveau de carburant au départ"
                                />
                                <FuelBar level={form.fuelOut} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 6 }} />
                            </div>
                        </div>

                        {/* Emplacement de stationnement & DSA */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-parking-out">Stationnement au départ</label>
                                <input
                                    id="edit-parking-out"
                                    className="form-input"
                                    placeholder="ex: Emplacement A2"
                                    value={form.parkingOut}
                                    onChange={(e) => setForm({ ...form, parkingOut: e.target.value })}
                                />
                            </div>
                            {vehicle.hasDSA && (
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 28 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                                        <input
                                            type="checkbox"
                                            checked={form.dsaChecked}
                                            onChange={(e) => setForm({ ...form, dsaChecked: e.target.checked })}
                                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                                        />
                                        <span>DSA vérifié</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* État et propreté */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-condition-out">État au départ *</label>
                                <select
                                    id="edit-condition-out"
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
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-cleanliness-out">Propreté au départ</label>
                                <select
                                    id="edit-cleanliness-out"
                                    className="form-select"
                                    value={form.cleanlinessOut}
                                    onChange={(e) => setForm({ ...form, cleanlinessOut: e.target.value })}
                                >
                                    <option value="Propre">✨ Propre</option>
                                    <option value="Correct">👍 Correct</option>
                                    <option value="Sale">⚠️ Sale</option>
                                    <option value="Très sale">❌ Très sale</option>
                                </select>
                            </div>
                        </div>

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="edit-comments-out">Commentaires au départ</label>
                            <textarea
                                id="edit-comments-out"
                                className="form-textarea"
                                placeholder="Remarques au départ..."
                                value={form.commentsOut}
                                onChange={(e) => setForm({ ...form, commentsOut: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!form.driverId || submitting}>
                            {submitting ? 'Enregistrement...' : '💾 Enregistrer les modifications'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
