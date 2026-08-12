'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import IncidentReportModal from '@/components/vehicle/modals/IncidentReportModal';
import CheckOutForm from './CheckOutForm';
import CheckInForm from './CheckInForm';
import VehicleInfoCard from './VehicleInfoCard';
import QRActions from './QRActions';
import type { QRVehicle } from './types';

export default function QRVehiclePage() {
    const params = useParams();
    const token = params.token as string;
    const router = useRouter();

    const [vehicle, setVehicle] = useState<QRVehicle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { data: session } = useSession();
    const currentUserId = session?.user?.id ?? null;
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [step, setStep] = useState<'view' | 'checkout' | 'checkin'>('view');
    const [done, setDone] = useState<'checkedout' | 'checkedin' | null>(null);
    const [showIncidentReport, setShowIncidentReport] = useState(false);

    function showToast(message: string, type = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    const fetchVehicleAbortRef = useRef<AbortController | null>(null);

    const fetchVehicle = useCallback(async () => {
        fetchVehicleAbortRef.current?.abort();
        const controller = new AbortController();
        fetchVehicleAbortRef.current = controller;
        setLoading(true);
        try {
            const res = await fetch(`/api/qr/${token}/vehicle`, { signal: controller.signal });
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
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setError('Erreur de connexion');
        } finally {
            if (fetchVehicleAbortRef.current === controller) setLoading(false);
        }
    }, [token, router]);

    useEffect(() => {
        fetchVehicle();
        return () => fetchVehicleAbortRef.current?.abort();
    }, [fetchVehicle]);

    const activeTrip = vehicle?.activeTrip;
    const canCheckIn = !!activeTrip && (
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

                        <VehicleInfoCard vehicle={vehicle} />

                        {/* Actions */}
                        {step === 'view' && (
                            <QRActions
                                vehicle={vehicle}
                                canCheckIn={canCheckIn}
                                onCheckOut={() => setStep('checkout')}
                                onCheckIn={() => setStep('checkin')}
                                onDeclareIncident={() => setShowIncidentReport(true)}
                            />
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
