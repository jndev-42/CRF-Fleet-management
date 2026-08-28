'use client';

import { useEffect, useRef, useState } from 'react';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import MileageAnomalyModal from '@/components/ui/MileageAnomalyModal';
import {
    MAX_KM_PER_DAY,
    checkMileageAnomaly,
    elapsedDays,
    formatElapsed,
    negativeMileageMessage,
} from '@/lib/utils/mileageAnomaly';
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
    const [mileageConfirm, setMileageConfirm] =
        useState<{ delta: number; maxKm: number; durationLabel: string } | null>(null);
    /** Anti-boucle : un second MILEAGE_CONFIRM_REQUIRED après confirmation affiche l'erreur brute. */
    const confirmSentRef = useRef(false);

    // Ce formulaire n'a pas de bascule « saisie manuelle » : son équivalent strict est !isConnected,
    // qui conditionne déjà l'envoi de mileageIn. activeTrip peut être null → garde obligatoire.
    // Champ vidé : form.mileageIn est typé `number` et alimenté par Number(e.target.value),
    // donc vider le champ donne 0 (jamais ''), soit un 'negative' transitoire assumé —
    // l'input porte `required`, l'état n'est de toute façon pas soumettable. Le garde
    // `typeof === 'number'` de CheckInModal serait ici toujours vrai : ne pas le recopier.
    const activeTrip = vehicle.activeTrip;
    const mileageAnomaly = !isConnected && activeTrip
        ? checkMileageAnomaly(form.mileageIn, activeTrip.mileageOut, activeTrip.checkOutAt)
        : null;

    useEffect(() => {
        if (!isDesinf && !hasDesinfTracking) return;
        fetch('/api/users')
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
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

        // Modale ouverte avant tout envoi : « Corriger » ne doit déclencher aucune requête.
        if (mileageAnomaly === 'excessive' && activeTrip) {
            setMileageConfirm({
                delta: form.mileageIn - activeTrip.mileageOut,
                maxKm: MAX_KM_PER_DAY * elapsedDays(activeTrip.checkOutAt),
                durationLabel: formatElapsed(activeTrip.checkOutAt),
            });
            return;
        }

        await doSubmit(false);
    }

    async function doSubmit(confirmed: boolean) {
        if (confirmed) confirmSentRef.current = true;
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
                if (confirmed) body.confirmMileageAnomaly = true;
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
                // Divergence d'horloge front/serveur : la modale est peuplée EXCLUSIVEMENT
                // depuis les champs du corps 400, jamais par recalcul local.
                if (json.code === 'MILEAGE_CONFIRM_REQUIRED' && !confirmSentRef.current) {
                    setMileageConfirm({
                        delta: json.delta,
                        maxKm: json.maxKm,
                        durationLabel: json.durationLabel,
                    });
                    return;
                }
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
        <>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 8, padding: '10px 14px', color: 'var(--error-text)', fontSize: 14
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
                            onChange={e => {
                                // Nouvelle valeur = nouvelle décision : la confirmation
                                // précédente ne doit pas court-circuiter la modale.
                                confirmSentRef.current = false;
                                setForm(f => ({ ...f, mileageIn: Number(e.target.value) }));
                            }}
                            style={mileageAnomaly === 'negative' ? { borderColor: 'var(--error-text)' } : undefined}
                            aria-invalid={mileageAnomaly === 'negative' ? true : undefined}
                            required
                        />
                        {mileageAnomaly === 'negative' && activeTrip && (
                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--error-text)' }}>
                                {negativeMileageMessage(activeTrip.mileageOut)}
                            </div>
                        )}
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
                    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--status-available)'
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
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--status-available)' }}>
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
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: 'var(--status-available)' }}>
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
                disabled={submitting || mileageAnomaly === 'negative'}
                style={{ marginTop: 4 }}
            >
                {submitting ? '⏳ Retour en cours...' : '✅ Confirmer le retour'}
            </button>
        </form>

        {mileageConfirm !== null && (
            <MileageAnomalyModal
                delta={mileageConfirm.delta}
                durationLabel={mileageConfirm.durationLabel}
                maxKm={mileageConfirm.maxKm}
                onCancel={() => {
                    // « Corriger » : l'utilisateur repart d'une saisie, pas d'une confirmation.
                    confirmSentRef.current = false;
                    setMileageConfirm(null);
                }}
                onConfirm={() => {
                    setMileageConfirm(null);
                    void doSubmit(true);
                }}
            />
        )}
        </>
    );
}
