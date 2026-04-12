import React, { useState, useEffect } from 'react';
import { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import { isConnected, formatDate } from '@/app/vehicles/[id]/utils';
import FuelBar from '@/components/vehicle/FuelBar';
import ChecklistItems from '../ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import PhotoPicker from '@/components/ui/PhotoPicker';

interface CheckInModalProps {
    vehicle: Vehicle;
    trip: Trip;
    onClose: () => void;
    /** Called after the API request completes successfully */
    onSuccess: () => void;
    /** Called after the API request completes successfully (triggers data refetch) */
    onRefetch?: () => void;
    /** Pre-filled disinfection responsable ID (from DesinfPreCheckinModal) */
    initialDesinfResponsableId?: string;
    /** Pre-filled disinfection lot number (from DesinfPreCheckinModal) */
    initialDesinfLotNumber?: string;
}

/**
 * Modal shown when a user is returning a vehicle.
 * Collects returning mileage, condition, issues, and photos.
 */
export default function CheckInModal({ vehicle, trip, onClose, onSuccess, onRefetch, initialDesinfResponsableId = '', initialDesinfLotNumber = '' }: CheckInModalProps) {
    const [form, setForm] = useState<{
        mileageIn: number | '';
        fuelIn: number;
        parkingInSelection: string;
        parkingInCustom: string;
        conditionIn: string;
        cleanlinessIn: string;
        incident: string;
        commentsIn: string;
    }>({
        mileageIn: isConnected(vehicle.vin) ? vehicle.mileage : '',
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
    const [desinfResponsableId, setDesinfResponsableId] = useState(initialDesinfResponsableId);
    const [desinfLotNumber, setDesinfLotNumber] = useState(initialDesinfLotNumber);
    const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);

    const isDesinf = trip.missionType === 'Désinfection';

    useEffect(() => {
        if (!isDesinf) return;
        fetch('/api/users')
            .then(res => res.json())
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [isDesinf, vehicle.type]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (isDesinf && (!desinfResponsableId || !desinfLotNumber.trim())) {
            alert('Le responsable de la désinfection et le numéro de lot sont obligatoires.');
            return;
        }

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

            const desinfResponsableUser = users.find(u => u.id === desinfResponsableId);
            const desinfResponsableName = desinfResponsableUser?.name || desinfResponsableUser?.email || undefined;

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
                    desinfResponsable: isDesinf ? desinfResponsableName : undefined,
                    desinfLotNumber: isDesinf ? desinfLotNumber.trim() : undefined,
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
                                        onChange={(e) => setForm({ ...form, mileageIn: e.target.value === '' ? '' : Number(e.target.value) })}
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

                        {/* Champs Désinfection */}
                        {isDesinf && (
                            <div
                                style={{
                                    marginBottom: 20,
                                    padding: '14px 16px',
                                    background: 'rgba(16, 185, 129, 0.05)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#059669' }}>
                                    🧴 Informations de désinfection
                                </div>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label className="form-label" htmlFor="checkin-desinf-responsable">
                                        Responsable de la désinf. *
                                    </label>
                                    <UserCombobox
                                        users={users}
                                        value={desinfResponsableId}
                                        onChange={setDesinfResponsableId}
                                        defaultLabel="— Sélectionner un responsable —"
                                        placeholder="Rechercher..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="checkin-desinf-lot">
                                        Numéro de lot de désinf. *
                                    </label>
                                    <input
                                        id="checkin-desinf-lot"
                                        className="form-input"
                                        type="text"
                                        placeholder="Ex : LOT-2026-001"
                                        value={desinfLotNumber}
                                        onChange={e => setDesinfLotNumber(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        )}

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
                            <PhotoPicker
                                label="📸 Photos après le retour (Optionnel)"
                                hint="Ces photos seront envoyées sur un Google Drive. Maximum 10 Mo par photo."
                                photos={photos}
                                onPhotosChange={setPhotos}
                                maxFiles={10}
                                maxSizeMB={10}
                            />
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
