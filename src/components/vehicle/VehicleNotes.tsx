import React, { useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';

interface VehicleNotesProps {
    vehicle: Vehicle;
    userRoles: string[];
    onSaveNotes: (notes: string) => Promise<void>;
}

/**
 * Component for reading and editing arbitrary text notes pertaining to a vehicle.
 */
export default function VehicleNotes({ vehicle, userRoles, onSaveNotes }: VehicleNotesProps) {
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [editNotesValue, setEditNotesValue] = useState(vehicle.notes || '');

    const handleSave = async () => {
        await onSaveNotes(editNotesValue);
        setIsEditingNotes(false);
    };

    return (
        <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="detail-card-title" style={{ margin: 0 }}>Notes</div>
                {userRoles.includes('ADMIN') && !isEditingNotes && (
                    <button
                        onClick={() => {
                            setEditNotesValue(vehicle.notes || '');
                            setIsEditingNotes(true);
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 13 }}
                    >
                        ✏️ Éditer
                    </button>
                )}
            </div>
            {isEditingNotes ? (
                <div>
                    <textarea
                        className="form-textarea"
                        value={editNotesValue}
                        onChange={(e) => setEditNotesValue(e.target.value)}
                        rows={4}
                        placeholder="Saisissez des informations sur le véhicule..."
                        style={{ marginBottom: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setIsEditingNotes(false)}
                        >
                            Annuler
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                        >
                            Sauvegarder
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ color: vehicle.notes ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 14 }}>
                    {vehicle.notes ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{vehicle.notes}</div>
                    ) : 'Aucune note pour ce véhicule.'}
                </div>
            )}
        </div>
    );
}
