'use client';

import { useState } from 'react';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import type { QRVehicle } from './types';

export default function CheckOutForm({
    vehicle,
    token,
    onSuccess,
}: {
    vehicle: QRVehicle;
    token: string;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        missionType: 'DPS',
        missionName: '',
        conditionOut: 'Bon état',
        cleanlinessOut: 'Propre',
        commentsOut: '',
        parkingOut: vehicle.parkingSpot || '',
    });
    const [checklistOut, setChecklistOut] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const isDsaChecked = checklistOut[`dsa-checkout-${vehicle.id}`] || false;

            const res = await fetch(`/api/qr/${token}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    missionType: form.missionType,
                    missionName: form.missionName || undefined,
                    conditionOut: form.conditionOut,
                    cleanlinessOut: form.cleanlinessOut,
                    parkingOut: form.parkingOut || undefined,
                    commentsOut: form.commentsOut || undefined,
                    dsaChecked: isDsaChecked,
                    checklistOut: Object.keys(checklistOut).length > 0 ? checklistOut : undefined,
                }),
            });

            const json = await res.json();
            if (res.ok) {
                onSuccess();
            } else {
                setError(json.error || 'Erreur lors de la prise du véhicule');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    const isVPSP = vehicle.type.toUpperCase().includes('VPSP');
    const missionTypes = [
        'DPS', 'PAPS', 'Réseaux', 'Urgence', 'Opération', 'Formation', 'Logistique', 'Maraude', 'Administratif',
        ...(isVPSP ? ['Désinfection'] : []),
        'Autre',
    ];
    const conditions = ['Bon état', 'Acceptable', 'Dégradé', 'Problème signalé'];
    const cleanlinesses = ['Propre', 'Correct', 'Sale'];

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 8, padding: '10px 14px', color: 'var(--error-text)', fontSize: 14
                }}>
                    {error}
                </div>
            )}

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Type de mission *
                </label>
                <select
                    className="form-input"
                    value={form.missionType}
                    onChange={e => setForm(f => ({ ...f, missionType: e.target.value }))}
                    required
                >
                    {missionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Nom de la mission
                </label>
                <input
                    className="form-input"
                    type="text"
                    placeholder="Ex : DPS Football Stade de France"
                    value={form.missionName}
                    onChange={e => setForm(f => ({ ...f, missionName: e.target.value }))}
                />
            </div>

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    État du véhicule *
                </label>
                <select
                    className="form-input"
                    value={form.conditionOut}
                    onChange={e => setForm(f => ({ ...f, conditionOut: e.target.value }))}
                    required
                >
                    {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Propreté
                </label>
                <select
                    className="form-input"
                    value={form.cleanlinessOut}
                    onChange={e => setForm(f => ({ ...f, cleanlinessOut: e.target.value }))}
                >
                    {cleanlinesses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <ChecklistItems
                vehicleId={vehicle.id}
                type="checkout"
                responses={checklistOut}
                onChange={setChecklistOut}
            />

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Commentaires
                </label>
                <textarea
                    className="form-input"
                    placeholder="Remarques optionnelles..."
                    value={form.commentsOut}
                    onChange={e => setForm(f => ({ ...f, commentsOut: e.target.value }))}
                    style={{ minHeight: 72, resize: 'vertical' }}
                />
            </div>

            <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={submitting}
                style={{ marginTop: 4 }}
            >
                {submitting ? '⏳ Prise en cours...' : '🚗 Confirmer l\'emprunt'}
            </button>
        </form>
    );
}
