import { useState } from 'react';
import PhotoViewer from '@/components/PhotoViewer';
import TripItem from '@/components/vehicle/TripItem';
import type { Trip, Vehicle } from './types';

const TRIPS_PER_PAGE = 3;

interface TripHistoryListProps {
    vehicle: Vehicle;
    userRoles: string[];
    onClearHistory: () => Promise<void>;
    onDeleteTrip: (tripId: string) => Promise<void>;
    onEditCheckOut: (trip: Trip) => void;
}

export default function TripHistoryList({
    vehicle,
    userRoles,
    onClearHistory,
    onDeleteTrip,
    onEditCheckOut,
}: TripHistoryListProps) {
    const [tripsPage, setTripsPage] = useState(1);
    const [viewingPhotosFolderId, setViewingPhotosFolderId] = useState<string | null>(null);

    return (
        <>
            <div className="section-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Historique des sorties</h2>
                    {userRoles.includes('ADMIN') && vehicle.trips.length > 0 && (
                        <button
                            className="btn btn-secondary"
                            style={{ color: 'var(--status-maintenance)', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '4px 10px', fontSize: 13 }}
                            onClick={async () => {
                                if (window.confirm("Voulez-vous vraiment effacer TOUT l'historique de ce véhicule ? Cette action est irréversible.")) {
                                    await onClearHistory();
                                }
                            }}
                        >
                            🗑️ Vider
                        </button>
                    )}
                </div>
            </div>

            {vehicle.trips.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">Aucune sortie enregistrée</div>
                </div>
            ) : (() => {
                const totalPages = Math.ceil(vehicle.trips.length / TRIPS_PER_PAGE);
                const visibleTrips = vehicle.trips.slice(
                    (tripsPage - 1) * TRIPS_PER_PAGE,
                    tripsPage * TRIPS_PER_PAGE
                );
                return (
                    <>
                        <ul role="list" aria-label="Historique des sorties" className="trip-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {visibleTrips.map((trip) => (
                                <li key={trip.id}>
                                    <TripItem
                                        trip={trip}
                                        vehicle={vehicle}
                                        userRoles={userRoles}
                                        onDelete={async (tripId: string) => {
                                            if (window.confirm("Voulez-vous vraiment supprimer cette sortie de l'historique ?")) {
                                                await onDeleteTrip(tripId);
                                                // Stay on previous page if current page becomes empty after deletion
                                                setTripsPage(p => Math.min(p, Math.ceil((vehicle.trips.length - 1) / TRIPS_PER_PAGE)));
                                            }
                                        }}
                                        onViewPhotos={(folderId: string) => setViewingPhotosFolderId(folderId)}
                                        onEditCheckOut={(tripToEdit) => onEditCheckOut(tripToEdit)}
                                    />
                                </li>
                            ))}
                        </ul>
                        {totalPages > 1 && (
                            <nav aria-label="Pagination de l'historique" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                marginTop: 16,
                                fontSize: 14,
                            }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px' }}
                                    onClick={() => setTripsPage(p => p - 1)}
                                    disabled={tripsPage === 1}
                                    aria-label="Page précédente"
                                >
                                    ← Précédent
                                </button>
                                <span style={{ color: 'var(--text-secondary)' }} aria-live="polite">
                                    {tripsPage} / {totalPages}
                                </span>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px' }}
                                    onClick={() => setTripsPage(p => p + 1)}
                                    disabled={tripsPage === totalPages}
                                    aria-label="Page suivante"
                                >
                                    Suivant →
                                </button>
                            </nav>
                        )}
                    </>
                );
            })()}

            {viewingPhotosFolderId && (
                <PhotoViewer
                    driveFolderId={viewingPhotosFolderId}
                    onClose={() => setViewingPhotosFolderId(null)}
                />
            )}
        </>
    );
}
