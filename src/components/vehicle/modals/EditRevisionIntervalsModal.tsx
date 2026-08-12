import React, { useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';

interface EditRevisionIntervalsModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    onSuccess: (updatedVehicle: Vehicle) => void;
}

export default function EditRevisionIntervalsModal({ vehicle, onClose, onSuccess }: EditRevisionIntervalsModalProps) {
    const [firstRegistrationDate, setFirstRegistrationDate] = useState<string>(vehicle.firstRegistrationDate ?? '');
    const [revisionKmInterval, setRevisionKmInterval] = useState<number | ''>(vehicle.revisionKmInterval ?? '');
    const [revisionYearInterval, setRevisionYearInterval] = useState<number | ''>(vehicle.revisionYearInterval ?? '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const payload: {
            firstRegistrationDate?: string;
            revisionKmInterval?: number;
            revisionYearInterval?: number;
        } = {};
        if (firstRegistrationDate) payload.firstRegistrationDate = firstRegistrationDate;
        if (revisionKmInterval !== '') payload.revisionKmInterval = revisionKmInterval;
        if (revisionYearInterval !== '') payload.revisionYearInterval = revisionYearInterval;

        try {
            const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicle.name)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erreur lors de la mise à jour');
            }

            const updatedVehicle = await res.json();
            onSuccess(updatedVehicle);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header">
                    <h2 className="modal-title">✏️ Intervalles de révision</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form className="modal-body" onSubmit={handleSubmit}>
                    {error && (
                        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 14 }}>
                            {error}
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label" htmlFor="firstRegistrationDate">Date de première immatriculation</label>
                        <input
                            id="firstRegistrationDate"
                            type="date"
                            className="form-input"
                            value={firstRegistrationDate}
                            onChange={(e) => setFirstRegistrationDate(e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label" htmlFor="revisionKmInterval">Intervalle de révision (km)</label>
                        <input
                            id="revisionKmInterval"
                            type="number"
                            className="form-input"
                            value={revisionKmInterval}
                            onChange={(e) => setRevisionKmInterval(e.target.value ? parseInt(e.target.value, 10) : '')}
                            min={1}
                            placeholder="ex : 20000"
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label" htmlFor="revisionYearInterval">Intervalle de révision (années)</label>
                        <input
                            id="revisionYearInterval"
                            type="number"
                            className="form-input"
                            value={revisionYearInterval}
                            onChange={(e) => setRevisionYearInterval(e.target.value ? parseInt(e.target.value, 10) : '')}
                            min={1}
                            max={10}
                            placeholder="ex : 1"
                        />
                    </div>
                    <div className="modal-footer" style={{ marginTop: 24, padding: 0, justifyContent: 'flex-end', display: 'flex', gap: 12 }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
