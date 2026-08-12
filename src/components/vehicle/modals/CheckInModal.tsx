import React, { useState, useEffect } from 'react';
import { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import { isConnected, formatDate } from '@/app/vehicles/[id]/utils';
import { useUL } from '@/lib/contexts/ULContext';
import FuelBar from '@/components/vehicle/FuelBar';
import ChecklistItems from '../ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import PhotoPicker from '@/components/ui/PhotoPicker';
import IncidentReportModal from './IncidentReportModal';
import MarineApprovedOverlay from '@/components/ui/MarineApprovedOverlay';
import { uploadFilesToDriveSafely } from '@/lib/imageCompression';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

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
    /** UL ID of the current user — animation only shown for Paris 18 */
    currentUserUlId?: string;
}

/**
 * Modal shown when a user is returning a vehicle.
 * Collects returning mileage, condition, issues, and photos.
 */
export default function CheckInModal({ vehicle, trip, onClose, onSuccess, onRefetch, initialDesinfResponsableId = '', initialDesinfLotNumber = '', currentUserUlId }: CheckInModalProps) {
    useEscapeKey(onClose);
    const { activeUL } = useUL();
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
        mileageIn: vehicle.mileage,
        fuelIn: vehicle.fuelLevel,
        parkingInSelection: 'Autre',
        parkingInCustom: trip.parkingOut || '',
        conditionIn: trip.conditionOut || 'Bon état',
        cleanlinessIn: trip.cleanlinessOut || 'Propre',
        incident: '',
        commentsIn: '',
    });

    const [defaultParkingSpots, setDefaultParkingSpots] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/ul')
            .then(r => { if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`); return r.json(); })
            .then(ulData => {
                const targetUlId = currentUserUlId || activeUL?.id || vehicle.ulId;
                const uls: Array<{ id: string; defaultParkingSpots?: string[] }> = ulData?.uls || [];
                
                let spots: string[] = [];
                if (targetUlId) {
                    const activeUl = uls.find(u => u.id === targetUlId);
                    if (activeUl?.defaultParkingSpots) {
                        spots = activeUl.defaultParkingSpots;
                    }
                }

                setDefaultParkingSpots(spots);
                setForm(f => {
                    const currentSpot = trip.parkingOut || vehicle.parkingSpot;
                    if (currentSpot) {
                        const match = spots.find(s => s === currentSpot);
                        if (match) {
                            return { ...f, parkingInSelection: match, parkingInCustom: '' };
                        } else {
                            return { ...f, parkingInSelection: 'Autre', parkingInCustom: currentSpot };
                        }
                    }
                    return { ...f, parkingInSelection: spots[0] || 'Autre' };
                });
            })
            .catch(console.error);
    }, [vehicle.ulId, currentUserUlId, activeUL?.id, trip.parkingOut, vehicle.parkingSpot]);

    const [checklistIn, setChecklistIn] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [photos, setPhotos] = useState<File[]>([]);
    const [desinfResponsableId, setDesinfResponsableId] = useState(initialDesinfResponsableId);
    const [desinfLotNumber, setDesinfLotNumber] = useState(initialDesinfLotNumber);
    const [desinfType, setDesinfType] = useState('simple');
    const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [loadingRenault, setLoadingRenault] = useState(isConnected(vehicle.vin));
    const [renaultError, setRenaultError] = useState(false);
    const [manualEntry, setManualEntry] = useState(!isConnected(vehicle.vin));
    const [showIncidentReport, setShowIncidentReport] = useState(false);
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

    const isDesinf = trip.missionType === 'Désinfection';
    const isVPSP = vehicle.type.toUpperCase().includes('VPSP');
    const hasDesinfTracking = vehicle.desinfTracking && !isVPSP;

    useEffect(() => {
        if (!isDesinf && !hasDesinfTracking) return;
        fetch('/api/users')
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [isDesinf, hasDesinfTracking, vehicle.type]);

    useEffect(() => {
        if (isConnected(vehicle.vin)) {
            fetch(`/api/renault/${encodeURIComponent(vehicle.vin!)}`)
                .then(r => { if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`); return r.json(); })
                .then(rData => {
                    if (rData.error) {
                        setRenaultError(true);
                        setManualEntry(true);
                    } else {
                        if (rData.totalMileage !== null) setForm(f => ({ ...f, mileageIn: rData.totalMileage }));
                        if (vehicle.fuelType === 'Électrique') {
                            if (rData.batteryLevel !== null) setForm(f => ({ ...f, fuelIn: rData.batteryLevel }));
                        } else if (rData.fuelQuantity !== null) {
                            const fuelPct = Math.min(Math.round((rData.fuelQuantity / (vehicle.maxFuelCapacity ?? 50)) * 100), 100);
                            setForm(f => ({ ...f, fuelIn: fuelPct }));
                        }
                    }
                })
                .catch(() => {
                    setRenaultError(true);
                    setManualEntry(true);
                })
                .finally(() => setLoadingRenault(false));
        }
    }, [vehicle.vin, vehicle.fuelType, vehicle.maxFuelCapacity]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (isDesinf && (!desinfResponsableId || !desinfLotNumber.trim())) {
            alert('Le responsable de la désinfection et le numéro de lot sont obligatoires.');
            return;
        }

        if (hasDesinfTracking && (!desinfLotNumber.trim() || !desinfType)) {
            alert('Le numéro de lot et le type de désinfection sont obligatoires.');
            return;
        }

        setSubmitting(true);

        try {
            const finalParkingIn = form.parkingInSelection === 'Autre'
                ? form.parkingInCustom
                : form.parkingInSelection;

            let driveFolderId: string | undefined = undefined;
            if (photos.length > 0) {
                const checkOutDate = new Date(trip.checkOutAt);
                const year = checkOutDate.getFullYear();
                const month = String(checkOutDate.getMonth() + 1).padStart(2, '0');
                const day = String(checkOutDate.getDate()).padStart(2, '0');
                const hours = String(checkOutDate.getHours()).padStart(2, '0');
                const minutes = String(checkOutDate.getMinutes()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}_${hours}-${minutes}`;

                const uploadResult = await uploadFilesToDriveSafely({
                    files: photos,
                    vehicleName: vehicle.name,
                    date: dateStr,
                    stage: 'rendu',
                    existingFolderId: trip.driveFolderId || null,
                });

                if (!uploadResult.success) {
                    alert(uploadResult.error || 'Erreur lors de l\'upload des photos.');
                    setSubmitting(false);
                    return;
                }

                driveFolderId = uploadResult.folderId;
            }

            const desinfResponsableUser = users.find(u => u.id === desinfResponsableId);
            const desinfResponsableName = desinfResponsableUser?.name || desinfResponsableUser?.email || undefined;

            const res = await fetch(`/api/trips/${trip.id}/checkin`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mileageIn: manualEntry ? form.mileageIn : undefined,
                    fuelIn: manualEntry ? form.fuelIn : undefined,
                    parkingIn: finalParkingIn,
                    conditionIn: form.conditionIn,
                    cleanlinessIn: form.cleanlinessIn,
                    incident: form.incident,
                    commentsIn: form.commentsIn,
                    checklistIn: Object.keys(checklistIn).length > 0 ? checklistIn : undefined,
                    driveFolderId,
                    desinfResponsable: isDesinf ? desinfResponsableName : undefined,
                    desinfLotNumber: isDesinf ? desinfLotNumber.trim() : (hasDesinfTracking ? desinfLotNumber.trim() : undefined),
                    desinfType: isDesinf ? undefined : (hasDesinfTracking ? desinfType : undefined),
                }),
            });

            if (res.ok) {
                // API completed successfully — show success animation only for Paris 18
                if (currentUserUlId === 'ul-paris-18') {
                    setShowSuccessAnimation(true);
                } else {
                    onSuccess();
                    onRefetch?.();
                }
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
                            {(manualEntry || !isConnected(vehicle.vin)) && (
                                <div className="form-group">
                                    <label className="form-label" htmlFor="checkin-mileage">
                                        Kilométrage actuel *
                                        {loadingRenault && <span style={{ marginLeft: 8, fontSize: 11 }}>⌛ Chargement...</span>}
                                        {isConnected(vehicle.vin) && !loadingRenault && !renaultError && <span style={{ marginLeft: 8, color: '#059669', fontSize: 11 }}>📡 Connecté</span>}
                                        {renaultError && <span style={{ marginLeft: 8, color: '#DC2626', fontSize: 11 }}>⚠️ Renault injoignable</span>}
                                    </label>
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
                                    {defaultParkingSpots.map(spot => (
                                        <option key={spot} value={spot}>{spot}</option>
                                    ))}
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
                        {(manualEntry || !isConnected(vehicle.vin)) && (
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
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, padding: '12px 14px', background: manualEntry ? 'var(--status-maintenance-bg)' : 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--radius-sm)', border: `1px solid ${manualEntry ? 'rgba(239,68,68,0.4)' : 'rgba(59, 130, 246, 0.2)'}` }}>
                                    <input
                                        type="checkbox"
                                        checked={manualEntry}
                                        onChange={e => setManualEntry(e.target.checked)}
                                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                                    />
                                    <span>{renaultError ? '⚠️ Renault injoignable : Saisie manuelle obligatoire' : 'Saisir manuellement le kilométrage/carburant'}</span>
                                </label>
                                {!manualEntry && !renaultError && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 4 }}>
                                        ℹ️ Les données remontent automatiquement depuis le véhicule.
                                    </div>
                                )}
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

                        {/* Champs Désinfection — VPSP (mission Désinfection) */}
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

                        {/* Champs Désinfection — non-VPSP avec suivi activé */}
                        {hasDesinfTracking && (
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
                                    🧴 Désinfection du véhicule
                                </div>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label className="form-label" htmlFor="checkin-desinf-type">
                                        Type de désinfection *
                                    </label>
                                    <select
                                        id="checkin-desinf-type"
                                        className="form-select"
                                        value={desinfType}
                                        onChange={e => setDesinfType(e.target.value)}
                                        required
                                    >
                                        <option value="simple">🧼 Simple</option>
                                        <option value="complète">✨ Complète</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="checkin-desinf-lot-nonvpsp">
                                        Numéro de lot utilisé *
                                    </label>
                                    <input
                                        id="checkin-desinf-lot-nonvpsp"
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
                                hint="Ces photos seront envoyées sur un Google Drive. Maximum 15 Mo par photo · 150 Mo max au total."
                                photos={photos}
                                onPhotosChange={setPhotos}
                                maxSizeMB={15}
                                maxTotalSizeMB={150}
                            />
                        </div>
                    </div>
                    <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                            onClick={() => setShowIncidentReport(true)}
                        >
                            🚨 Signaler incident
                        </button>

                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-success" disabled={submitting}>
                            {submitting ? 'En cours...' : '✅ Rendre le véhicule'}
                        </button>
                    </div>
                </form>
            </div>

            {showIncidentReport && (
                <IncidentReportModal
                    vehicle={vehicle}
                    tripId={trip.id}
                    onClose={() => setShowIncidentReport(false)}
                />
            )}

            {showSuccessAnimation && (
                <MarineApprovedOverlay
                    imageSrc="/mecano-pierro.png"
                    stampText="Pierre approved"
                    onAnimationComplete={() => {
                        setShowSuccessAnimation(false);
                        onSuccess();
                        onRefetch?.();
                    }}
                />
            )}
        </div>
    );
}
