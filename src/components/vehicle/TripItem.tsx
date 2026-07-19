import React from 'react';
import { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import { formatDate } from '@/app/vehicles/[id]/utils';

interface TripItemProps {
    trip: Trip;
    vehicle: Vehicle;
    userRoles: string[];
    onDelete: (tripId: string) => Promise<void>;
    onViewPhotos: (folderId: string) => void;
}

/**
 * Renders a single trip log detailing checkout and check-in times, mileage, fuel, and incident reports.
 */
export default function TripItem({ trip, vehicle, userRoles, onDelete, onViewPhotos }: TripItemProps) {
    return (
        <div className={`trip-item ${!trip.checkInAt ? 'active' : ''}`}>
            <div className="trip-header">
                <div>
                    <span className="trip-driver">🧑‍✈️ {trip.driverName} {trip.secondDriverName ? ` & ${trip.secondDriverName}` : ''}</span>
                    <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                        {trip.missionType}{trip.missionName ? ` — ${trip.missionName}` : ''}
                    </span>
                    {trip.desinfType && (
                        <span style={{
                            marginLeft: 10,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: trip.desinfType === 'complète' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                            color: trip.desinfType === 'complète' ? '#059669' : '#3B82F6',
                        }}>
                            {trip.desinfType === 'complète' ? '✨ Désinf. complète' : '🧼 Désinf. simple'}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={`status-badge ${trip.checkInAt ? 'available' : 'inuse'}`}>
                        {trip.checkInAt ? 'Terminé' : 'En cours'}
                    </span>
                    {userRoles.includes('ADMIN') && (
                        <button
                            title="Supprimer cette sortie"
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
                                padding: '4px', opacity: 0.6
                            }}
                            onClick={() => onDelete(trip.id)}
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>

            <div className="trip-details">
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Départ</span>
                    <span className="trip-detail-value">{formatDate(trip.checkOutAt)}</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Retour</span>
                    <span className="trip-detail-value">
                        {trip.checkInAt ? formatDate(trip.checkInAt) : '—'}
                    </span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Km départ</span>
                    <span className="trip-detail-value">{trip.mileageOut.toLocaleString('fr-FR')} km</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Km retour</span>
                    <span className="trip-detail-value">
                        {trip.mileageIn ? (
                            <>
                                {trip.mileageIn.toLocaleString('fr-FR')} km
                                {trip.renaultDataValidated === 0 && trip.checkInAt && (
                                    <span
                                        title="Validation des données auprès de Renault en cours..."
                                        style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}
                                    >
                                        ⏳ Vérification...
                                    </span>
                                )}
                            </>
                        ) : '—'}
                    </span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">{vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} départ</span>
                    <span className="trip-detail-value">{trip.fuelOut}%</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">{vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')} retour</span>
                    <span className="trip-detail-value">
                        {trip.fuelIn !== null ? (
                            <>
                                {trip.fuelIn}%
                                {trip.renaultDataValidated === 0 && trip.checkInAt && (
                                    <span
                                        title="Validation des données auprès de Renault en cours..."
                                        style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}
                                    >
                                        ⏳ Vérification...
                                    </span>
                                )}
                            </>
                        ) : '—'}
                    </span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">État départ</span>
                    <span className="trip-detail-value">{trip.conditionOut}</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">État retour</span>
                    <span className="trip-detail-value">{trip.conditionIn || '—'}</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Propreté départ</span>
                    <span className="trip-detail-value">{trip.cleanlinessOut || '—'}</span>
                </div>
                <div className="trip-detail-item">
                    <span className="trip-detail-label">Propreté retour</span>
                    <span className="trip-detail-value">{trip.cleanlinessIn || '—'}</span>
                </div>
                {(trip.desinfType || trip.desinfLotNumber) && (
                    <div className="trip-detail-item">
                        <span className="trip-detail-label">Désinfection</span>
                        <span className="trip-detail-value">
                            {trip.desinfType ? (
                                <span style={{ fontWeight: 600, color: trip.desinfType === 'complète' ? '#059669' : '#3B82F6' }}>
                                    {trip.desinfType === 'complète' ? '✨ Complète' : '🧼 Simple'}
                                </span>
                            ) : (
                                'Effectuée'
                            )}
                            {trip.desinfLotNumber ? ` (Lot ${trip.desinfLotNumber})` : ''}
                        </span>
                    </div>
                )}
            </div>


            {trip.incident && (
                <div
                    style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        background: 'var(--status-maintenance-bg)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        fontSize: 13,
                        color: 'var(--status-maintenance)',
                    }}
                >
                    ⚠️ <strong>Incident :</strong> {trip.incident}
                </div>
            )}

            {(trip.commentsOut || trip.commentsIn) && (
                <div
                    style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid var(--border-primary)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                    }}
                >
                    {trip.commentsOut && <div>📝 <strong>Avant :</strong> {trip.commentsOut}</div>}
                    {trip.commentsIn && <div style={{ marginTop: 4 }}>📝 <strong>Après :</strong> {trip.commentsIn}</div>}
                </div>
            )}

            {trip.parkingPhoto && (
                <div style={{ marginTop: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- legacy data URL from upload;
                        not a static asset, cannot be optimized by next/image */}
                    <img
                        src={trip.parkingPhoto}
                        alt="Photo stationnement"
                        style={{
                            maxWidth: '100%',
                            maxHeight: 200,
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-primary)',
                        }}
                    />
                </div>
            )}

            {trip.driveFolderId && (
                <div style={{ marginTop: 12 }}>
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: '6px 12px' }}
                        onClick={() => onViewPhotos(trip.driveFolderId as string)}
                    >
                        📸 Voir les photos
                    </button>
                </div>
            )}
        </div>
    );
}
