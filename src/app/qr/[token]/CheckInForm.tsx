'use client';

import { useEffect, useState } from 'react';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import type { QRVehicle } from './types';

export default function CheckInForm({
    vehicle,
    token,
    onSuccess,
}: {
    vehicle: QRVehicle;
    token: string;
    onSuccess: () => void;
}) {
    const isConnected = !!vehicle.vin;
    const isVPSP = vehicle.type.toUpperCase().includes('VPSP');
    const isDesinf = vehicle.activeTrip?.missionType === 'Désinfection';
    const hasDesinfTracking = vehicle.desinfTracking && !isVPSP;

    const [form, setForm] = useState({
        conditionIn: 'Bon état',
        cleanlinessIn: 'Propre',
        incident: '',
        commentsIn: '',
        parkingIn: vehicle.parkingSpot || '',
        mileageIn: vehicle.mileage,
        fuelIn: vehicle.fuelLevel,
    });
    const [checklistIn, setChecklistIn] = useState<Record<string, boolean>>({});
    const [desinfResponsableId, setDesinfResponsableId] = useState('');
    const [desinfLotNumber, setDesinfLotNumber] = useState('');
    const [desinfType, setDesinfType] = useState('simple');
    const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isDesinf && !hasDesinfTracking) return;
        fetch('/api/users')
            .then(res => res.json())
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [isDesinf, hasDesinfTracking]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (isDesinf && (!desinfResponsableId || !desinfLotNumber.trim())) {
            setError('Le responsable de la désinfection et le numéro de lot sont obligatoires.');
            return;
        }

        if (hasDesinfTracking && (!desinfLotNumber.trim() || !desinfType)) {
            setError('Le numéro de lot et le type de désinfection sont obligatoires.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const desinfResponsableUser = users.find(u => u.id === desinfResponsableId);
            const desinfResponsableName = desinfResponsableUser?.name || desinfResponsableUser?.email || undefined;

            const body: Record<string, unknown> = {
                conditionIn: form.conditionIn,
                cleanlinessIn: form.cleanlinessIn,
                commentsIn: form.commentsIn || undefined,
                incident: form.incident || undefined,
                parkingIn: form.parkingIn || undefined,
                checklistIn: Object.keys(checklistIn).length > 0 ? checklistIn : undefined,
                desinfResponsable: isDesinf ? desinfResponsableName : undefined,
                desinfLotNumber: isDesinf ? desinfLotNumber.trim() : (hasDesinfTracking ? desinfLotNumber.trim() : undefined),
                desinfType: isDesinf ? undefined : (hasDesinfTracking ? desinfType : undefined),
            };

            // For non-connected vehicles, user must provide km and fuel
            if (!isConnected) {
                body.mileageIn = form.mileageIn;
                body.fuelIn = form.fuelIn;
            }

            const res = await fetch(`/api/qr/${token}/checkin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const json = await res.json();
            if (res.ok) {
                onSuccess();
            } else {
                setError(json.error || 'Erreur lors du retour du véhicule');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    const conditions = ['Bon état', 'Acceptable', 'Dégradé', 'Problème signalé'];
    const cleanlinesses = ['Propre', 'Correct', 'Sale'];

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 8, padding: '10px 14px', color: '#EF4444', fontSize: 14
                }}>
                    {error}
                </div>
            )}

            {!isConnected && (
                <>
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            Kilométrage retour *
                        </label>
                        <input
                            className="form-input"
                            type="number"
                            min={0}
                            value={form.mileageIn}
                            onChange={e => setForm(f => ({ ...f, mileageIn: Number(e.target.value) }))}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            {vehicle.fuelType === 'Électrique' ? 'Batterie (%)' : 'Carburant (%)'} *
                        </label>
                        <input
                            className="form-input"
                            type="number"
                            min={0}
                            max={100}
                            value={form.fuelIn}
                            onChange={e => setForm(f => ({ ...f, fuelIn: Number(e.target.value) }))}
                            required
                        />
                    </div>
                </>
            )}

            {isConnected && (
                <div style={{
                    background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#059669'
                }}>
                    📡 Véhicule connecté — kilométrage et carburant récupérés automatiquement.
                </div>
            )}

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    État du véhicule au retour *
                </label>
                <select
                    className="form-input"
                    value={form.conditionIn}
                    onChange={e => setForm(f => ({ ...f, conditionIn: e.target.value }))}
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
                    value={form.cleanlinessIn}
                    onChange={e => setForm(f => ({ ...f, cleanlinessIn: e.target.value }))}
                >
                    {cleanlinesses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <ChecklistItems
                vehicleId={vehicle.id}
                type="checkin"
                responses={checklistIn}
                onChange={setChecklistIn}
            />

            {/* Champs Désinfection — VPSP (mission Désinfection) */}
            {isDesinf && (
                <div
                    style={{
                        padding: '14px 16px',
                        background: 'rgba(16, 185, 129, 0.05)',
                        borderRadius: 8,
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#059669' }}>
                        🧴 Informations de désinfection
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
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
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            Numéro de lot de désinf. *
                        </label>
                        <input
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
                        padding: '14px 16px',
                        background: 'rgba(16, 185, 129, 0.05)',
                        borderRadius: 8,
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#059669' }}>
                        🧴 Suivi de désinfection
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            Numéro de lot du produit *
                        </label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="Ex : LOT-2026-001"
                            value={desinfLotNumber}
                            onChange={e => setDesinfLotNumber(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            Type de désinfection *
                        </label>
                        <select
                            className="form-input"
                            value={desinfType}
                            onChange={e => setDesinfType(e.target.value)}
                            required
                        >
                            <option value="simple">Simple</option>
                            <option value="complète">Complète</option>
                        </select>
                    </div>
                </div>
            )}

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Emplacement de stationnement
                </label>
                <input
                    className="form-input"
                    type="text"
                    placeholder="Ex : Place A3"
                    value={form.parkingIn}
                    onChange={e => setForm(f => ({ ...f, parkingIn: e.target.value }))}
                />
            </div>

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Commentaires / Incident
                </label>
                <textarea
                    className="form-input"
                    placeholder="Décrivez tout problème constaté..."
                    value={form.commentsIn}
                    onChange={e => setForm(f => ({ ...f, commentsIn: e.target.value }))}
                    style={{ minHeight: 72, resize: 'vertical' }}
                />
            </div>

            <button
                type="submit"
                className="btn btn-success btn-lg"
                disabled={submitting}
                style={{ marginTop: 4 }}
            >
                {submitting ? '⏳ Retour en cours...' : '✅ Confirmer le retour'}
            </button>
        </form>
    );
}
