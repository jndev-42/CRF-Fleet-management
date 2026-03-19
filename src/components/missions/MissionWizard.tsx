'use client';

import { useState } from 'react';
import { SUPPLY_CATEGORIES, type SupplyCategory } from '@/lib/mission-supplies';
import Step1General from './steps/Step1General';
import Step2Vehicle from './steps/Step2Vehicle';
import Step3Supplies from './steps/Step3Supplies';
import Step4Oxygen from './steps/Step4Oxygen';
import Step5Team from './steps/Step5Team';
import Step6Incidents from './steps/Step6Incidents';
import styles from './MissionWizard.module.css';

export interface MissionFormData {
    mission_type: 'RESEAU' | 'DPS' | 'PAPS';
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string;
    pegass_ok: boolean;
    vehicle_id: string | null;
    driver_id: string | null;
    victim_count: number;
    ul18_present: boolean | null;
    team_dynamics: 'BIEN' | 'PLUTOT_BIEN' | 'PEUT_MIEUX' | 'SUJET' | null;
    all_found_place: boolean | null;
    member_difficulties: boolean | null;
    free_comment: string | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
}

const STEPS = [
    'Général',
    'Équipage',
    'Matériel',
    'Oxygène',
    'Équipe',
    'Incidents',
];

const INITIAL_FORM: MissionFormData = {
    mission_type: 'RESEAU',
    mission_name: '',
    mission_date: new Date().toISOString().slice(0, 10),
    location: '',
    volunteers: '',
    pegass_ok: true,
    vehicle_id: null,
    driver_id: null,
    victim_count: 0,
    ul18_present: null,
    team_dynamics: null,
    all_found_place: null,
    member_difficulties: null,
    free_comment: null,
    had_acr: false,
    had_hemorrhage: false,
    had_complex_care: false,
    needs_followup: false,
};

interface MissionWizardProps {
    currentUserId?: string;
    currentUserName?: string;
    onSuccess: (id: string) => void;
}

export default function MissionWizard({ currentUserId, currentUserName, onSuccess }: MissionWizardProps) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<MissionFormData>(INITIAL_FORM);
    const [supplies, setSupplies] = useState<Record<string, number>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function patchFormData(patch: Partial<MissionFormData>) {
        setFormData(prev => ({ ...prev, ...patch }));
    }

    function handleSupplyChange(key: string, qty: number) {
        setSupplies(prev => ({ ...prev, [key]: qty }));
    }

    function validateStep(s: number): string | null {
        if (s === 1) {
            if (!formData.mission_type) return 'Veuillez sélectionner un type de mission.';
            if (!formData.mission_name.trim()) return 'Le nom de la mission est requis.';
            if (!formData.mission_date) return 'La date est requise.';
            if (!formData.location.trim()) return 'Le lieu est requis.';
        }
        if (s === 2) {
            if (!formData.pegass_ok && !formData.volunteers.trim()) return 'Veuillez renseigner les bénévoles présents (requis si inscriptions Pegass non à jour).';
        }
        return null;
    }

    function handleNext() {
        const err = validateStep(step);
        if (err) { setError(err); return; }
        setError(null);
        setStep(s => Math.min(STEPS.length, s + 1));
    }

    function handleBack() {
        setError(null);
        setStep(s => Math.max(1, s - 1));
    }

    async function handleSubmit() {
        setSubmitting(true);
        setError(null);

        // Build supplies array from the flat supplies map
        const suppliesArr = SUPPLY_CATEGORIES.flatMap((cat: SupplyCategory) =>
            Object.entries(supplies)
                .filter(([key]) => key.startsWith(`${cat}__`))
                .map(([key, qty]) => ({
                    category: cat,
                    item_name: key.slice(`${cat}__`.length),
                    quantity_used: qty,
                }))
        );

        try {
            const res = await fetch('/api/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, supplies: suppliesArr }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Erreur lors de la soumission.');
                return;
            }

            const data = await res.json();
            onSuccess(data.id);
        } catch {
            setError('Erreur réseau. Veuillez réessayer.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.wizard}>
            {/* Progress bar */}
            <div className={styles.progressBar} role="list" aria-label="Étapes du formulaire">
                {STEPS.map((label, idx) => {
                    const stepNum = idx + 1;
                    const isActive = stepNum === step;
                    const isDone = stepNum < step;
                    return (
                        <div
                            key={label}
                            role="listitem"
                            className={`${styles.progressStep} ${isActive ? styles.progressStepActive : ''} ${isDone ? styles.progressStepDone : ''}`}
                            aria-current={isActive ? 'step' : undefined}
                        >
                            {stepNum}. {label}
                        </div>
                    );
                })}
            </div>

            {error && <div className={styles.errorBox} role="alert">{error}</div>}

            {/* Step content */}
            {step === 1 && <Step1General data={formData} onChange={patchFormData} />}
            {step === 2 && <Step2Vehicle data={formData} onChange={patchFormData} currentUserId={currentUserId} currentUserName={currentUserName} />}
            {step === 3 && <Step3Supplies supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {step === 4 && <Step4Oxygen supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {step === 5 && <Step5Team data={formData} onChange={patchFormData} />}
            {step === 6 && <Step6Incidents data={formData} onChange={patchFormData} />}

            {/* Navigation */}
            <div className={styles.wizardNav}>
                {step > 1 ? (
                    <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={submitting}>
                        Précédent
                    </button>
                ) : <span />}

                <div className={styles.wizardNavRight}>
                    {step < STEPS.length ? (
                        <button type="button" className="btn btn-primary" onClick={handleNext}>
                            Suivant
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? 'Envoi...' : 'Soumettre le compte rendu'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
