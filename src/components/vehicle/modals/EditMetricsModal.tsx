import React, { useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import FuelBar from '@/components/vehicle/FuelBar';

interface EditMetricsModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    onSuccess: (updatedVehicle: Vehicle) => void;
}

export default function EditMetricsModal({ vehicle, onClose, onSuccess }: EditMetricsModalProps) {
    const [mileage, setMileage] = useState<number | ''>(vehicle.mileage);
    const [fuelLevel, setFuelLevel] = useState<number | ''>(vehicle.fuelLevel);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const m = typeof mileage === 'string' ? parseInt(mileage, 10) : mileage;
        const f = typeof fuelLevel === 'string' ? parseInt(fuelLevel, 10) : fuelLevel;

        if (isNaN(m) || isNaN(f)) {
            setError('Veuillez entrer des nombres valides.');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`/api/vehicles/${vehicle.id}/metrics`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mileage: m,
                    fuelLevel: f
                })
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
                    <h2 className="modal-title">✏️ Éditer les métriques</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form className="modal-body" onSubmit={handleSubmit}>
                    {error && (
                        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 14 }}>
                            {error}
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">Kilométrage (km)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={mileage}
                            onChange={(e) => setMileage(e.target.value ? parseInt(e.target.value, 10) : '')}
                            min={0}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label">
                            Niveau {vehicle.fuelType === 'Électrique' ? 'de batterie' : 'de carburant'} : {fuelLevel}%
                        </label>
                        <input
                            type="range"
                            className="fuel-slider"
                            value={fuelLevel === '' ? 0 : fuelLevel}
                            onChange={(e) => setFuelLevel(parseInt(e.target.value, 10))}
                            min={0}
                            max={100}
                        />
                        <FuelBar level={fuelLevel === '' ? 0 : fuelLevel} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 6 }} />
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
