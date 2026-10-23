'use client';

import { useState } from 'react';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import DataCorrectionFields from './DataCorrectionFields';
import { useQrDrivers } from './useQrDrivers';
import type { QRVehicle } from './types';
import { MILEAGE_DECREASE_CONFIRM_REQUIRED } from '@/lib/utils/mileageAnomaly';

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
    const drivers = useQrDrivers(token);
    const [secondDriverId, setSecondDriverId] = useState('');
    const [checklistOut, setChecklistOut] = useState<Record<string, boolean>>({});
    const [dataIncorrect, setDataIncorrect] = useState(false);
    // Chaîne vide autorisée : un champ vidé ne doit pas devenir 0 km.
    const [correctedMileage, setCorrectedMileage] = useState<number | ''>(vehicle.mileage);
    const [correctedFuel, setCorrectedFuel] = useState(vehicle.fuelLevel);
    // Seules les valeurs que l'utilisateur a modifiées sont envoyées. On suit la saisie
    // plutôt que de comparer à la valeur stockée : pour un véhicule connecté, le serveur
    // part de la télémétrie, et ressaisir la valeur stockée est une vraie correction.
    const [mileageTouched, setMileageTouched] = useState(false);
    const [fuelTouched, setFuelTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function postCheckout(confirmMileageDecrease: boolean) {
        const isDsaChecked = checklistOut[`dsa-checkout-${vehicle.id}`] || false;
        const sendMileage = dataIncorrect && mileageTouched && correctedMileage !== '';
        const sendFuel = dataIncorrect && fuelTouched;

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
                secondDriverId: secondDriverId || undefined,
                checklistOut: Object.keys(checklistOut).length > 0 ? checklistOut : undefined,
                dataIncorrect: (sendMileage || sendFuel) || undefined,
                correctedMileage: sendMileage ? correctedMileage : undefined,
                correctedFuel: sendFuel ? correctedFuel : undefined,
                confirmMileageDecrease: confirmMileageDecrease || undefined,
            }),
        });
        return { res, json: await res.json() };
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            let { res, json } = await postCheckout(false);
            // Kilométrage corrigé à la baisse : le serveur exige une confirmation explicite.
            if (!res.ok && json.code === MILEAGE_DECREASE_CONFIRM_REQUIRED) {
                if (!window.confirm(`${json.error}\n\nConfirmer l'emprunt avec ce kilométrage ?`)) return;
                ({ res, json } = await postCheckout(true));
            }
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

            <DataCorrectionFields
                connected={vehicle.connection?.status === 'CONNECTED'}
                fuelType={vehicle.fuelType}
                dataIncorrect={dataIncorrect}
                correctedMileage={correctedMileage}
                correctedFuel={correctedFuel}
                onDataIncorrectChange={setDataIncorrect}
                knownMileage={vehicle.mileage}
                onMileageChange={value => { setCorrectedMileage(value); setMileageTouched(true); }}
                onFuelChange={value => { setCorrectedFuel(value); setFuelTouched(true); }}
            />

            <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                    2ème conducteur (optionnel)
                </label>
                <UserCombobox
                    users={drivers}
                    value={secondDriverId}
                    onChange={setSecondDriverId}
                    defaultLabel="— Aucun —"
                    placeholder="Rechercher..."
                />
            </div>

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
