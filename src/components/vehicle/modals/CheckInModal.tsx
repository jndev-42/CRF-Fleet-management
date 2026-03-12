import React, { useState } from 'react';
import { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import { isConnected, formatDate } from '@/app/vehicles/[id]/utils';
import FuelBar from '@/components/vehicle/FuelBar';
import ChecklistItems from '../ChecklistItems';

interface CheckInModalProps {
    vehicle: Vehicle;
    trip: Trip;
    onClose: () => void;
    /** Called after the API request completes successfully */
    onSuccess: () => void;
    /** Called after the API request completes successfully (triggers data refetch) */
    onRefetch?: () => void;
}

/**
 * Modal shown when a user is returning a vehicle.
 * Collects returning mileage, condition, issues, and photos.
 */
export default function CheckInModal({ vehicle, trip, onClose, onSuccess, onRefetch }: CheckInModalProps) {
    const [form, setForm] = useState({
        mileageIn: vehicle.mileage,
        fuelIn: vehicle.fuelLevel,
        parkingInSelection: trip.parkingOut === "Baigneur (devant l’UL)" || trip.parkingOut === "Parking Aubervillers" ? trip.parkingOut : (trip.parkingOut ? "Autre" : "Baigneur (devant l’UL)"),
        parkingInCustom: trip.parkingOut && trip.parkingOut !== "Baigneur (devant l'UL)" && trip.parkingOut !== "Parking Aubervillers" ? trip.parkingOut : '',
        conditionIn: 'Bon état',
        cleanlinessIn: 'Propre',
        incident: '',
        commentsIn: '',
    });
    const [checklistIn, setChecklistIn] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [photos, setPhotos] = useState<File[]>([]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            const finalParkingIn = form.parkingInSelection === 'Autre'
                ? form.parkingInCustom
                : form.parkingInSelection;

            let driveFolderId: string | undefined = undefined;
            if (photos.length > 0) {
                const formData = new FormData();
                formData.append('vehicleName', vehicle.name);

                const checkOutDate = new Date(trip.checkOutAt);
                const year = checkOutDate.getFullYear();
                const month = String(checkOutDate.getMonth() + 1).padStart(2, '0');
                const day = String(checkOutDate.getDate()).padStart(2, '0');
                const hours = String(checkOutDate.getHours()).padStart(2, '0');
                const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
                const dateStr = `${year} -${month} -${day}_${hours} -${minutes} `;

                formData.append('date', dateStr);
                formData.append('stage', 'rendu');

                if (trip.driveFolderId) {
                    formData.append('existingDriveFolderId', trip.driveFolderId);
                }

                photos.forEach((file) => {
                    formData.append('files', file);
                });

                const uploadRes = await fetch('/api/drive/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) {
                    const errorData = await uploadRes.json();
                    console.error(`Erreur lors de l'upload des photos: ${errorData.error || uploadRes.statusText}`);
                } else {
                    const uploadData = await uploadRes.json();
                    driveFolderId = uploadData.folderId;
                }
            }

            const res = await fetch(`/api/trips/${trip.id}/checkin`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mileageIn: isConnected(vehicle.vin) ? undefined : form.mileageIn,
                    fuelIn: isConnected(vehicle.vin) ? undefined : form.fuelIn,
                    parkingIn: finalParkingIn,
                    conditionIn: form.conditionIn,
                    cleanlinessIn: form.cleanlinessIn,
                    incident: form.incident,
                    commentsIn: form.commentsIn,
                    checklistIn: Object.keys(checklistIn).length > 0 ? checklistIn : undefined,
                    driveFolderId,
                }),
            });

            if (res.ok) {
                // API completed successfully — close modal and trigger refetch
                onSuccess();
                onRefetch?.();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(errorData.error || 'Erreur lors du retour du véhicule');
                setSubmitting(false);
            }
        } catch (error) {
            console.error('Erreur de connexion lors du check-in:', error);
            alert('Erreur de connexion');
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" aria-hidden="true" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-checkin-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-checkin-title" className="modal-title">✅ Rendre {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
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
                            <div><strong>Chauffeur :</strong> {trip.driverName}</div>
                            <div><strong>Mission :</strong> {trip.missionType}{trip.missionName ? ` — ${trip.missionName}` : ''}</div>
                            <div><strong>Départ :</strong> {formatDate(trip.checkOutAt)}</div>
                            <div><strong>Km au départ :</strong> {trip.mileageOut.toLocaleString('fr-FR')} km</div>
                        </div>

                        {/* Km et parking */}
                        <div className="form-row">
                            {!isConnected(vehicle.vin) && (
                                <div className="form-group">
                                    <label className="form-label" htmlFor="checkin-mileage">Kilométrage actuel *</label>
                                    <input
                                        id="checkin-mileage"
                                        className="form-input"
                                        type="number"
                                        min={trip.mileageOut}
                                        value={form.mileageIn}
                                        onChange={(e) => setForm({ ...form, mileageIn: Number(e.target.value) })}
                                        required
                                    />
                                    <div className="form-hint">
                                        Min: {trip.mileageOut.toLocaleString('fr-FR')} km
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkin-parking">Place de stationnement</label>
                                <select
                                    id="checkin-parking"
                                    className="form-select"
                                    value={form.parkingInSelection}
                                    onChange={(e) => setForm({ ...form, parkingInSelection: e.target.value })}
                                >
                                    <option value="Baigneur (devant l’UL)">Baigneur (devant l’UL)</option>
                                    <option value="Parking Aubervillers">Parking Aubervillers</option>
                                    <option value="Autre">Autre</option>
                                </select>
                                {form.parkingInSelection === 'Autre' && (
                                    <input
                                        style={{ marginTop: 8 }}
                                        className="form-input"
                                        placeholder="Précisez la place..."
                                        value={form.parkingInCustom}
                                        onChange={(e) => setForm({ ...form, parkingInCustom: e.target.value })}
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        {/* Essence */}
                        {!isConnected(vehicle.vin) && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkin-fuel">{vehicle.fuelType === 'Électrique' ? 'Niveau de batterie *' : (vehicle.fuelType === 'Diesel' ? 'Niveau de diesel *' : 'Niveau d\'essence *')}</label>
                                <input
                                    id="checkin-fuel"
                                    type="range"
                                    className="fuel-slider"
                                    min={0}
                                    max={100}
                                    value={form.fuelIn}
                                    onChange={(e) => setForm({ ...form, fuelIn: Number(e.target.value) })}
                                    aria-label="Niveau de carburant"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={form.fuelIn}
                                />
                                <FuelBar level={form.fuelIn} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 8 }} />
                            </div>
                        )}

                        {isConnected(vehicle.vin) && (
                            <div style={{ marginBottom: 20, padding: 12, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: 13, color: '#1E40AF' }}>
                                ℹ️ <strong>Données connectées :</strong> Le kilométrage et le niveau de {vehicle.fuelType === 'Électrique' ? 'batterie' : 'carburant'} remontent automatiquement depuis le véhicule. Il n&apos;est pas nécessaire de les saisir.
                            </div>
                        )}

                        {/* État et propreté */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkin-condition">État du véhicule au retour *</label>
                                <select
                                    id="checkin-condition"
                                    className="form-select"
                                    value={form.conditionIn}
                                    onChange={(e) => setForm({ ...form, conditionIn: e.target.value })}
                                >
                                    <option value="Bon état">✅ Bon état</option>
                                    <option value="Correct">👍 Correct</option>
                                    <option value="Dégradé">⚠️ Dégradé</option>
                                    <option value="Problème signalé">❌ Problème à signaler</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkin-cleanliness">Propreté du véhicule</label>
                                <select
                                    id="checkin-cleanliness"
                                    className="form-select"
                                    value={form.cleanlinessIn}
                                    onChange={(e) => setForm({ ...form, cleanlinessIn: e.target.value })}
                                >
                                    <option value="Propre">✨ Propre</option>
                                    <option value="Correct">👍 Correct</option>
                                    <option value="Sale">⚠️ Sale</option>
                                    <option value="Très sale">❌ Très sale</option>
                                </select>
                            </div>
                        </div>

                        {/* Checklists */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                            <ChecklistItems
                                vehicleId={vehicle.id}
                                type="checkin"
                                responses={checklistIn}
                                onChange={setChecklistIn}
                            />
                        </div>

                        {/* Incident */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="checkin-incident">Incident sur véhicule</label>
                            <textarea
                                id="checkin-incident"
                                className="form-textarea"
                                placeholder="Décrire l'incident si applicable..."
                                value={form.incident}
                                onChange={(e) => setForm({ ...form, incident: e.target.value })}
                                style={{ minHeight: 60 }}
                            />
                        </div>

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="checkin-comments">Commentaires après le poste</label>
                            <textarea
                                id="checkin-comments"
                                className="form-textarea"
                                placeholder="Remarques sur le véhicule..."
                                value={form.commentsIn}
                                onChange={(e) => setForm({ ...form, commentsIn: e.target.value })}
                                style={{ minHeight: 60 }}
                            />
                        </div>

                        {/* Photos (Optionnel) */}
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label className="form-label" htmlFor="checkin-photos" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📸 Photos après le retour (Optionnel)
                                <span title="Ces photos seront envoyées sur un Google Drive. Maximum 10 Mo par photo." style={{ cursor: 'help', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>?</span>
                            </label>
                            <input
                                id="checkin-photos"
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
                        <button type="submit" className="btn btn-success" disabled={submitting}>
                            {submitting ? 'En cours...' : '✅ Rendre le véhicule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
