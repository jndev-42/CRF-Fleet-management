import React, { useState, useEffect } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';

import ChecklistItems from '../ChecklistItems';
import FuelBar from '@/components/vehicle/FuelBar';
import UserCombobox from '@/components/ui/UserCombobox';

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
        // driverName and driverEmail are display-only; the API resolves the driver from session server-side
        driverName: '',
        driverEmail: '',
        secondDriverId: '',
        missionType: 'DPS',
        missionName: '',
        conditionOut: 'Bon état',
        cleanlinessOut: 'Propre',
        parkingOut: vehicle.parkingSpot as string,
        commentsOut: '',
    });

    // Custom checklist responses
    const [checklistOut, setChecklistOut] = useState<Record<string, boolean>>({});

    const [dataIncorrect, setDataIncorrect] = useState(false);
    const [correctedMileage, setCorrectedMileage] = useState(vehicle.mileage);
    const [correctedFuel, setCorrectedFuel] = useState(vehicle.fuelLevel);

    const [submitting, setSubmitting] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [photos, setPhotos] = useState<File[]>([]);

    useEffect(() => {
        const sessionPromise = fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user) {
                    setForm(f => ({
                        ...f,
                        driverName: session.user.name || '',
                        driverEmail: session.user.email || '',
                    }));
                }
                return session;
            })
            .catch(console.error)
            .finally(() => setSessionLoading(false));

        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicle.type)}`)
            .then(res => res.json())
            .then(data => {
                if (data.users) setUsers(data.users);
            })
            .catch(console.error);

        // Pre-fill missionName from the user's closest reservation (by startTime)
        Promise.all([
            sessionPromise,
            fetch(`/api/vehicles/${vehicle.id}/reservations`).then(r => r.json()).catch(() => null),
        ]).then(([session, reservationsData]) => {
            const email = session?.user?.email;
            const reservations: Array<{ userEmail: string; reason?: string | null; startTime: string }> =
                Array.isArray(reservationsData) ? reservationsData : [];
            if (!email || reservations.length === 0) return;

            const userReservations = reservations.filter(r => r.userEmail === email && r.reason);
            if (userReservations.length === 0) return;

            const now = Date.now();
            const closest = userReservations.reduce((best, r) => {
                const diff = Math.abs(new Date(r.startTime).getTime() - now);
                const bestDiff = Math.abs(new Date(best.startTime).getTime() - now);
                return diff < bestDiff ? r : best;
            });

            if (closest.reason) {
                setForm(f => ({ ...f, missionName: closest.reason! }));
            }
        });
    }, [vehicle.id, vehicle.type]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

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
                    missionType: form.missionType,
                    missionName: form.missionName || undefined,
                    conditionOut: form.conditionOut,
                    cleanlinessOut: form.cleanlinessOut,
                    parkingOut: form.parkingOut || undefined,
                    commentsOut: form.commentsOut || undefined,
                    dsaChecked: isDsaChecked,
                    secondDriverId: form.secondDriverId || undefined,
                    driveFolderId,
                    checklistOut: Object.keys(checklistOut).length > 0 ? checklistOut : undefined,
                    dataIncorrect: dataIncorrect || undefined,
                    correctedMileage: dataIncorrect ? correctedMileage : undefined,
                    correctedFuel: dataIncorrect ? correctedFuel : undefined,
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
        <div className="modal-overlay" aria-hidden="true" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-checkout-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-checkout-title" className="modal-title">🚗 Prendre {vehicle.name}</h2>
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
                            <div><strong>Immatriculation :</strong> {vehicle.plate}</div>
                            <div><strong>Kilométrage :</strong> {vehicle.mileage.toLocaleString('fr-FR')} km</div>
                            <div><strong>{vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} :</strong> {vehicle.fuelLevel}%</div>
                            {vehicle.hasDSA && <div><strong>DSA :</strong> Équipé</div>}
                        </div>

                        {/* Correction données véhicule (véhicule non connecté) */}
                        {!vehicle.vin && (
                            <div
                                style={{
                                    marginBottom: 20,
                                    padding: '12px 14px',
                                    background: dataIncorrect ? 'var(--status-maintenance-bg)' : 'var(--bg-card)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: `1px solid ${dataIncorrect ? 'rgba(239,68,68,0.4)' : 'var(--border-primary)'}`,
                                }}
                            >
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                                    <input
                                        type="checkbox"
                                        checked={dataIncorrect}
                                        onChange={e => setDataIncorrect(e.target.checked)}
                                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                                    />
                                    <span>Le kilométrage et/ou le niveau d&apos;essence est erroné</span>
                                </label>

                                {dataIncorrect && (
                                    <div className="form-row" style={{ marginTop: 14 }}>
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="checkout-corrected-mileage">Kilométrage réel (km)</label>
                                            <input
                                                id="checkout-corrected-mileage"
                                                className="form-input"
                                                type="number"
                                                min={0}
                                                value={correctedMileage}
                                                onChange={e => setCorrectedMileage(Number(e.target.value))}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="checkout-corrected-fuel">
                                                {vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} réel : {correctedFuel}%
                                            </label>
                                            <input
                                                id="checkout-corrected-fuel"
                                                type="range"
                                                className="fuel-slider"
                                                min={0}
                                                max={100}
                                                value={correctedFuel}
                                                onChange={e => setCorrectedFuel(Number(e.target.value))}
                                                aria-label="Niveau de carburant"
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={correctedFuel}
                                            />
                                            <FuelBar level={correctedFuel} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 6 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Identité */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkout-driver-name">Votre nom * <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    id="checkout-driver-name"
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
                                <label className="form-label" htmlFor="checkout-driver-email">Email <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    id="checkout-driver-email"
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
                            <UserCombobox
                                users={users}
                                value={form.secondDriverId}
                                onChange={id => setForm({ ...form, secondDriverId: id })}
                                defaultLabel="— Aucun —"
                                placeholder="Rechercher..."
                            />
                        </div>

                        {/* Mission */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkout-mission-type">Type de mission *</label>
                                <select
                                    id="checkout-mission-type"
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
                                <label className="form-label" htmlFor="checkout-mission-name">Nom de la mission</label>
                                <input
                                    id="checkout-mission-name"
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

                        {/* État et propreté */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="checkout-condition">État du véhicule *</label>
                                <select
                                    id="checkout-condition"
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
                                <label className="form-label" htmlFor="checkout-cleanliness">Propreté du véhicule</label>
                                <select
                                    id="checkout-cleanliness"
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

                        {/* Custom Checklist */}
                        <ChecklistItems
                            vehicleId={vehicle.id}
                            type="checkout"
                            responses={checklistOut}
                            onChange={setChecklistOut}
                        />

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label" htmlFor="checkout-comments">Commentaires avant le poste</label>
                            <textarea
                                id="checkout-comments"
                                className="form-textarea"
                                placeholder="Remarques sur le véhicule..."
                                value={form.commentsOut}
                                onChange={(e) => setForm({ ...form, commentsOut: e.target.value })}
                            />
                        </div>

                        {/* Photos (Optionnel) */}
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label className="form-label" htmlFor="checkout-photos" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📸 Photos avant départ (Optionnel)
                                <span title="Ces photos seront envoyées sur un Google Drive. Maximum 10 Mo par photo." style={{ cursor: 'help', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>?</span>
                            </label>
                            <input
                                id="checkout-photos"
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
