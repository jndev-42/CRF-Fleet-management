'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FuelBar from '@/components/vehicle/FuelBar';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import UserCombobox from '@/components/ui/UserCombobox';
import IncidentReportModal from '@/components/vehicle/modals/IncidentReportModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveTrip {
    id: string;
    vehicleId: string;
    driverId: string;
    secondDriverId: string | null;
    driverName: string | null;
    driverEmail: string | null;
    secondDriverName: string | null;
    secondDriverEmail: string | null;
    missionType: string;
    missionName: string | null;
    checkOutAt: string;
    mileageOut: number;
    fuelOut: number;
    conditionOut: string;
}

interface QRVehicle {
    id: string;
    name: string;
    plate: string;
    type: string;
    status: string;
    fuelLevel: number;
    mileage: number;
    fuelType: string | null;
    hasDSA: boolean;
    desinfTracking: boolean;
    parkingSpot: string | null;
    vin: string | null;
    maxFuelCapacity: number | null;
    activeTrip: ActiveTrip | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ── CheckOut Form ─────────────────────────────────────────────────────────────

function CheckOutForm({
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
                    borderRadius: 8, padding: '10px 14px', color: '#EF4444', fontSize: 14
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

// ── CheckIn Form ──────────────────────────────────────────────────────────────

function CheckInForm({
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QRVehiclePage() {
    const params = useParams();
    const token = params.token as string;
    const router = useRouter();

    const [vehicle, setVehicle] = useState<QRVehicle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [step, setStep] = useState<'view' | 'checkout' | 'checkin'>('view');
    const [done, setDone] = useState<'checkedout' | 'checkedin' | null>(null);
    const [showIncidentReport, setShowIncidentReport] = useState(false);

    function showToast(message: string, type = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    const fetchVehicle = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/qr/${token}/vehicle`);
            if (res.status === 401) {
                router.push(`/login?callbackUrl=${encodeURIComponent(`/qr/${token}`)}`);
                return;
            }
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Erreur de chargement');
                return;
            }
            const data = await res.json();
            setVehicle(data);
        } catch {
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }, [token, router]);

    useEffect(() => {
        // Get current user id for "can check in" logic
        fetch('/api/auth/session')
            .then(r => r.json())
            .then(s => { if (s?.user?.id) setCurrentUserId(s.user.id); })
            .catch(console.error);

        fetchVehicle();
    }, [fetchVehicle]);

    const activeTrip = vehicle?.activeTrip;
    const canCheckIn = activeTrip && (
        activeTrip.driverId === currentUserId ||
        activeTrip.secondDriverId === currentUserId
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '24px 16px 48px',
            background: 'var(--bg-primary)',
        }}>
            {/* Header branding */}
            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/crf-logo.svg"
                    alt="Croix-Rouge française"
                    style={{ width: 56, height: 56, marginBottom: 8 }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                    Accès QR Code
                </div>
            </div>

            <div style={{ width: '100%', maxWidth: 440 }}>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                        Chargement...
                    </div>
                )}

                {/* Error */}
                {!loading && error && (
                    <div style={{
                        textAlign: 'center',
                        padding: 32,
                        background: 'rgba(239,68,68,0.07)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 16,
                    }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
                        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Accès impossible</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{error}</div>
                    </div>
                )}

                {/* Success state */}
                {!loading && done && (
                    <div style={{
                        textAlign: 'center',
                        padding: 40,
                        background: 'rgba(16,185,129,0.07)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: 16,
                    }}>
                        <div style={{ fontSize: 56, marginBottom: 16 }}>
                            {done === 'checkedout' ? '🚗' : '✅'}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
                            {done === 'checkedout' ? 'Véhicule emprunté !' : 'Véhicule rendu !'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            {done === 'checkedout'
                                ? 'Bon trajet ! N\'oubliez pas de scanner ce QR Code à votre retour pour rendre le véhicule.'
                                : 'Merci pour votre retour. Le véhicule est de nouveau disponible.'}
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={() => { setDone(null); fetchVehicle(); setStep('view'); }}
                        >
                            Retour
                        </button>
                    </div>
                )}

                {/* Vehicle card */}
                {!loading && !error && vehicle && !done && (
                    <>
                        {/* QR bypass notice */}
                        <div style={{
                            background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.25)',
                            borderRadius: 10,
                            padding: '10px 14px',
                            fontSize: 12,
                            color: '#60A5FA',
                            marginBottom: 20,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <span>📲</span>
                            <span>Accès via QR Code — limité à ce véhicule uniquement.</span>
                        </div>

                        {/* Vehicle info card */}
                        <div style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 16,
                            padding: '20px 24px',
                            marginBottom: 20,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{vehicle.name}</h1>
                                <span style={{
                                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                    background: vehicle.status === 'AVAILABLE'
                                        ? 'rgba(16,185,129,0.15)' : vehicle.status === 'IN_USE'
                                            ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                                    color: vehicle.status === 'AVAILABLE'
                                        ? '#059669' : vehicle.status === 'IN_USE'
                                            ? '#D97706' : '#64748B',
                                }}>
                                    {vehicle.status === 'AVAILABLE' ? 'Disponible' :
                                        vehicle.status === 'IN_USE' ? 'En mission' : 'Indisponible'}
                                </span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                                {vehicle.plate} · {vehicle.type}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Kilométrage</div>
                                    <div style={{ fontWeight: 700 }}>{vehicle.mileage.toLocaleString('fr-FR')} km</div>
                                </div>
                                <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                                        {vehicle.fuelType === 'Électrique' ? 'Batterie' : 'Carburant'}
                                    </div>
                                    <div style={{ fontWeight: 700 }}>{vehicle.fuelLevel}%</div>
                                    <FuelBar level={vehicle.fuelLevel} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 4 }} />
                                </div>
                            </div>

                            {vehicle.parkingSpot && (
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    📍 Stationnement : <strong>{vehicle.parkingSpot}</strong>
                                </div>
                            )}
                        </div>

                        {/* Active trip info */}
                        {activeTrip && (
                            <div style={{
                                background: 'var(--status-inuse-bg)',
                                border: '1px solid var(--status-inuse)',
                                borderRadius: 12,
                                padding: '14px 18px',
                                marginBottom: 20,
                            }}>
                                <div style={{ fontWeight: 700, color: 'var(--status-inuse)', marginBottom: 4 }}>
                                    🧑‍✈️ En mission avec {activeTrip.driverName}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Depuis le {formatDate(activeTrip.checkOutAt)} · {activeTrip.missionType}
                                    {activeTrip.missionName && ` : ${activeTrip.missionName}`}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        {step === 'view' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {vehicle.status === 'AVAILABLE' && (
                                    <button
                                        className="btn btn-primary btn-lg"
                                        onClick={() => setStep('checkout')}
                                        style={{ width: '100%' }}
                                    >
                                        🚗 Emprunter ce véhicule
                                    </button>
                                )}

                                {vehicle.status === 'IN_USE' && canCheckIn && (
                                    <button
                                        className="btn btn-success btn-lg"
                                        onClick={() => setStep('checkin')}
                                        style={{ width: '100%' }}
                                    >
                                        ✅ Rendre ce véhicule
                                    </button>
                                )}

                                {vehicle.status === 'IN_USE' && !canCheckIn && (
                                    <div style={{
                                        textAlign: 'center', padding: '16px 20px',
                                        background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                                        borderRadius: 12, fontSize: 14, color: 'var(--text-secondary)'
                                    }}>
                                        Ce véhicule est actuellement en mission.<br />
                                        Seul l&apos;emprunteur peut le rendre via ce QR Code.
                                    </div>
                                )}

                                {vehicle.status === 'MAINTENANCE' && (
                                    <div style={{
                                        textAlign: 'center', padding: '16px 20px',
                                        background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                                        borderRadius: 12, fontSize: 14, color: 'var(--text-secondary)'
                                    }}>
                                        🔧 Ce véhicule est en maintenance et n&apos;est pas disponible.
                                    </div>
                                )}

                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowIncidentReport(true)}
                                    style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)', width: '100%' }}
                                >
                                    🚨 Déclarer un incident
                                </button>
                            </div>
                        )}

                        {/* Checkout form */}
                        {step === 'checkout' && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setStep('view')}
                                        style={{ padding: '6px 12px', fontSize: 13 }}
                                    >
                                        ← Retour
                                    </button>
                                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Emprunter {vehicle.name}</h2>
                                </div>
                                <CheckOutForm
                                    vehicle={vehicle}
                                    token={token}
                                    onSuccess={() => {
                                        setDone('checkedout');
                                        showToast('Véhicule emprunté avec succès !');
                                    }}
                                />
                            </div>
                        )}

                        {/* Checkin form */}
                        {step === 'checkin' && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setStep('view')}
                                        style={{ padding: '6px 12px', fontSize: 13 }}
                                    >
                                        ← Retour
                                    </button>
                                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Rendre {vehicle.name}</h2>
                                </div>
                                <CheckInForm
                                    vehicle={vehicle}
                                    token={token}
                                    onSuccess={() => {
                                        setDone('checkedin');
                                        showToast('Véhicule rendu avec succès !');
                                    }}
                                />
                            </div>
                        )}

                        {showIncidentReport && vehicle && (
                            <IncidentReportModal
                                vehicle={vehicle}
                                tripId={activeTrip?.id}
                                onClose={() => setShowIncidentReport(false)}
                                onSuccess={() => {
                                    showToast('Incident déclaré avec succès !');
                                    fetchVehicle();
                                }}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.message}</div>
                </div>
            )}
        </div>
    );
}
