import React, { useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import IncidentGuidelines from '@/components/vehicle/IncidentGuidelines';

interface IncidentReportModalProps {
    vehicle: Vehicle;
    /** Optional — pre-links the report to an active trip */
    tripId?: string;
    /** Optional — pre-links the report to a reservation */
    reservationId?: string;
    onClose: () => void;
    /** Called when the DRAFT report is created */
    onSuccess?: (reportId: string) => void;
}

type Step = 'GUIDELINES_PROMPT' | 'GUIDELINES_VIEW' | 'TYPE_SELECTION';

/**
 * Modal multi-étapes pour déclarer un incident véhicule.
 *
 * Phase 1 — machine d'états :
 *   GUIDELINES_PROMPT → (Oui) → GUIDELINES_VIEW → (Déclarer) → TYPE_SELECTION
 *   GUIDELINES_PROMPT → (Non)                               → TYPE_SELECTION
 *
 * Phase 2 : TYPE_SELECTION sera enrichi avec les formulaires Accident et Flash Radar.
 */
export default function IncidentReportModal({
    vehicle,
    tripId,
    reservationId,
    onClose,
    onSuccess,
}: IncidentReportModalProps) {
    const [step, setStep] = useState<Step>('GUIDELINES_PROMPT');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Crée un rapport DRAFT via l'API puis notifie le parent.
     * Appelé lors de la transition vers TYPE_SELECTION.
     */
    async function createDraftReport(): Promise<string | null> {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: vehicle.id,
                    tripId: tripId ?? undefined,
                    reservationId: reservationId ?? undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Erreur lors de la création du rapport');
                return null;
            }
            return data.id as string;
        } catch {
            setError('Erreur de connexion');
            return null;
        } finally {
            setSubmitting(false);
        }
    }

    async function handleGoToTypeSelection() {
        const reportId = await createDraftReport();
        if (reportId === null) return; // error already set
        setStep('TYPE_SELECTION');
        onSuccess?.(reportId);
    }

    // ── Titres par étape ──────────────────────────────────────────────────────
    const titles: Record<Step, string> = {
        GUIDELINES_PROMPT: '🚨 Déclarer un incident',
        GUIDELINES_VIEW: '📋 Consignes incident',
        TYPE_SELECTION: '🚨 Type d\'incident',
    };

    return (
        <div
            className="modal-overlay"
            aria-hidden="true"
            onClick={onClose}
            style={{ zIndex: 10001 }}
        >
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-incident-title"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="modal-header">
                    <h2 id="modal-incident-title" className="modal-title">
                        {titles[step]}
                    </h2>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Fermer la modale"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body">
                    {error && (
                        <div
                            style={{
                                padding: '10px 14px',
                                background: 'rgba(239, 68, 68, 0.08)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                marginBottom: 16,
                                fontSize: 13,
                                color: '#DC2626',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {/* ── Step: GUIDELINES_PROMPT ── */}
                    {step === 'GUIDELINES_PROMPT' && (
                        <div>
                            <div
                                style={{
                                    padding: '14px 16px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-primary)',
                                    marginBottom: 20,
                                    fontSize: 14,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                Vous vous apprêtez à déclarer un incident sur le véhicule{' '}
                                <strong style={{ color: 'var(--text-primary)' }}>{vehicle.name}</strong>.
                            </div>
                            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginTop: 0 }}>
                                Souhaitez-vous consulter les consignes à suivre en cas d&apos;incident ?
                            </p>
                        </div>
                    )}

                    {/* ── Step: GUIDELINES_VIEW ── */}
                    {step === 'GUIDELINES_VIEW' && <IncidentGuidelines />}

                    {/* ── Step: TYPE_SELECTION ── */}
                    {step === 'TYPE_SELECTION' && (
                        <div>
                            <p
                                style={{
                                    fontSize: 14,
                                    color: 'var(--text-secondary)',
                                    marginTop: 0,
                                    marginBottom: 20,
                                }}
                            >
                                Sélectionnez le type d&apos;incident à déclarer (fonctionnalité à venir) :
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Carte désactivée — Phase 2 */}
                                <div
                                    style={{
                                        padding: '16px 18px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-secondary)',
                                        opacity: 0.5,
                                        cursor: 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                    }}
                                    aria-disabled="true"
                                >
                                    <span style={{ fontSize: 28 }}>🚗</span>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                                            Accident / Incident de circulation
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Collision, accrochage, chute, bris de glace…
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            marginLeft: 'auto',
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-card)',
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            border: '1px solid var(--border-primary)',
                                        }}
                                    >
                                        Bientôt
                                    </span>
                                </div>

                                {/* Carte désactivée — Phase 2 */}
                                <div
                                    style={{
                                        padding: '16px 18px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-primary)',
                                        background: 'var(--bg-secondary)',
                                        opacity: 0.5,
                                        cursor: 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                    }}
                                    aria-disabled="true"
                                >
                                    <span style={{ fontSize: 28 }}>📸</span>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                                            Flash radar / Infraction
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Excès de vitesse, feu rouge, stationnement…
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            marginLeft: 'auto',
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            background: 'var(--bg-card)',
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            border: '1px solid var(--border-primary)',
                                        }}
                                    >
                                        Bientôt
                                    </span>
                                </div>
                            </div>

                            <p
                                style={{
                                    marginTop: 16,
                                    marginBottom: 0,
                                    fontSize: 13,
                                    color: 'var(--text-secondary)',
                                    fontStyle: 'italic',
                                }}
                            >
                                ✅ Le rapport a bien été enregistré. Un responsable prendra contact avec vous.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    {step === 'GUIDELINES_PROMPT' && (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setStep('GUIDELINES_VIEW')}
                            >
                                Oui, voir les consignes
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ background: '#DC2626' }}
                                onClick={handleGoToTypeSelection}
                                disabled={submitting}
                            >
                                {submitting ? '...' : 'Non, déclarer directement'}
                            </button>
                        </>
                    )}

                    {step === 'GUIDELINES_VIEW' && (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ background: '#DC2626' }}
                                onClick={handleGoToTypeSelection}
                                disabled={submitting}
                            >
                                {submitting ? '...' : '🚨 Déclarer l\'incident'}
                            </button>
                        </>
                    )}

                    {step === 'TYPE_SELECTION' && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            Fermer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}