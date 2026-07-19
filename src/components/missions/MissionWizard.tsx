'use client';

import { useState } from 'react';
import { SUPPLY_CATEGORIES, type SupplyCategory } from '@/lib/mission-supplies';
import Step1General from './steps/Step1General';
import Step2Vehicle from './steps/Step2Vehicle';
import Step3Supplies from './steps/Step3Supplies';
import Step4Oxygen from './steps/Step4Oxygen';
import Step5Team from './steps/Step5Team';
import Step6Incidents from './steps/Step6Incidents';
import Step7SignedReport from './steps/Step7SignedReport';
import Step8Photos from './steps/Step8Photos';
import styles from './MissionWizard.module.css';
import MarineApprovedOverlay from '@/components/ui/MarineApprovedOverlay';

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

const MISSION_COMM_FOLDER_ID = '19ILEUHsq2pLZDwEeJDnhQcumFM9ztDJ3';
const SIGNED_REPORTS_FOLDER_ID = '1UQ0TxOLUCmL09m6evy1Ofoeuo2RaD2ki';

interface MissionWizardProps {
    currentUserId?: string;
    currentUserName?: string;
    /** UL ID of the current user — animation only shown for Paris 18 */
    currentUserUlId?: string;
    onSuccess: (id: string) => void;
}

export default function MissionWizard({ currentUserId, currentUserName, currentUserUlId, onSuccess }: MissionWizardProps) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<MissionFormData>(INITIAL_FORM);
    const [supplies, setSupplies] = useState<Record<string, number>>({});
    const [signedReportFile, setSignedReportFile] = useState<File | null>(null);
    const [photos, setPhotos] = useState<File[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
    const [successMissionId, setSuccessMissionId] = useState<string | null>(null);

    const showReportStep = formData.mission_type === 'DPS' || formData.mission_type === 'PAPS';
    const isExternalVehicle = formData.vehicle_id?.startsWith('EXTERNAL_');

    const activeSteps = [
        'Général',
        'Équipage',
        ...(!isExternalVehicle ? ['Matériel', 'Oxygène'] : []),
        'Équipe',
        'Incidents',
        ...(showReportStep ? ['Rapport signé'] : []),
        'Photos',
    ];

    // Ensure step index is not out of bounds if activeSteps length decreases
    const currentStepIndex = Math.min(step, activeSteps.length);
    const currentStepLabel = activeSteps[currentStepIndex - 1];

    function patchFormData(patch: Partial<MissionFormData>) {
        setFormData(prev => ({ ...prev, ...patch }));
    }

    function handleSupplyChange(key: string, qty: number) {
        setSupplies(prev => ({ ...prev, [key]: qty }));
    }

    function validateStep(s: number): string | null {
        const label = activeSteps[s - 1];
        if (label === 'Général') {
            if (!formData.mission_type) return 'Veuillez sélectionner un type de mission.';
            if (!formData.mission_name.trim()) return 'Le nom de la mission est requis.';
            if (!formData.mission_date) return 'La date est requise.';
            if (!formData.location.trim()) return 'Le lieu est requis.';
        }
        if (label === 'Équipage') {
            if (!formData.pegass_ok && !formData.volunteers.trim()) return 'Veuillez renseigner les bénévoles présents (requis si inscriptions Pegass non à jour).';
        }
        if (label === 'Rapport signé') {
            if (!signedReportFile) return 'Le rapport signé est obligatoire. Veuillez photographier ou importer le document.';
        }
        return null;
    }

    function handleNext() {
        const err = validateStep(currentStepIndex);
        if (err) { setError(err); return; }
        setError(null);
        setStep(s => Math.min(activeSteps.length, s + 1));
    }

    function handleBack() {
        setError(null);
        setStep(s => Math.max(1, s - 1));
    }

    async function handleSubmit() {
        setSubmitting(true);
        setError(null);
        setUploadError(null);

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

        // Upload the signed report (mandatory for DPS/PAPS)
        let signedReportDriveId: string | null = null;
        if (showReportStep && signedReportFile) {
            try {
                const fd = new FormData();
                fd.append('missionName', formData.mission_name);
                fd.append('date', formData.mission_date);
                fd.append('rootFolderId', SIGNED_REPORTS_FOLDER_ID);
                fd.append('allowPdf', 'true');
                fd.append('files', signedReportFile);

                const uploadRes = await fetch('/api/drive/upload', { method: 'POST', body: fd });
                if (!uploadRes.ok) {
                    const d = await uploadRes.json();
                    setUploadError(d.error || 'Erreur lors de l\'upload du rapport signé.');
                    setSubmitting(false);
                    return;
                }
                const uploadData = await uploadRes.json();
                signedReportDriveId = uploadData.fileIds?.[0] ?? null;
            } catch {
                setUploadError('Erreur réseau lors de l\'upload du rapport signé.');
                setSubmitting(false);
                return;
            }
        }

        // Upload communication photos to Drive if any were selected
        let driveFolderId: string | null = null;
        if (photos.length > 0) {
            try {
                const fd = new FormData();
                fd.append('missionName', formData.mission_name);
                fd.append('date', formData.mission_date);
                fd.append('rootFolderId', MISSION_COMM_FOLDER_ID);
                photos.forEach(f => fd.append('files', f));

                const uploadRes = await fetch('/api/drive/upload', { method: 'POST', body: fd });
                if (!uploadRes.ok) {
                    const d = await uploadRes.json();
                    setUploadError(d.error || 'Erreur lors de l\'upload des photos.');
                    setSubmitting(false);
                    return;
                }
                const uploadData = await uploadRes.json();
                driveFolderId = uploadData.folderId ?? null;
            } catch {
                setUploadError('Erreur réseau lors de l\'upload des photos.');
                setSubmitting(false);
                return;
            }
        }

        try {
            const res = await fetch('/api/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    supplies: suppliesArr,
                    drive_folder_id: driveFolderId,
                    signed_report_drive_id: signedReportDriveId,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Erreur lors de la soumission.');
                return;
            }

            const data = await res.json();
            setSuccessMissionId(data.id);
            // Show success animation only for Paris 18 UL
            if (currentUserUlId === 'ul-paris-18') {
                setShowSuccessAnimation(true);
            } else {
                onSuccess(data.id);
            }
        } catch {
            setError('Erreur réseau. Veuillez réessayer.');
        } finally {
            setSubmitting(false);
        }
    }

    const isLastStep = currentStepIndex === activeSteps.length;

    return (
        <div className={styles.wizard}>
            {/* Progress bar */}
            <div className={styles.progressBar} role="list" aria-label="Étapes du formulaire">
                {activeSteps.map((label, idx) => {
                    const stepNum = idx + 1;
                    const isActive = stepNum === currentStepIndex;
                    const isDone = stepNum < currentStepIndex;
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
            {currentStepLabel === 'Général' && <Step1General data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Équipage' && <Step2Vehicle data={formData} onChange={patchFormData} currentUserId={currentUserId} currentUserName={currentUserName} />}
            {currentStepLabel === 'Matériel' && <Step3Supplies supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {currentStepLabel === 'Oxygène' && <Step4Oxygen supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {currentStepLabel === 'Équipe' && <Step5Team data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Incidents' && <Step6Incidents data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Rapport signé' && <Step7SignedReport file={signedReportFile} onChange={setSignedReportFile} />}
            {currentStepLabel === 'Photos' && <Step8Photos photos={photos} onPhotosChange={setPhotos} uploadError={uploadError} />}

            {/* Navigation */}
            <div className={styles.wizardNav}>
                {currentStepIndex > 1 ? (
                    <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={submitting}>
                        Précédent
                    </button>
                ) : <span />}

                <div className={styles.wizardNavRight}>
                    {!isLastStep ? (
                        <button type="button" className="btn btn-primary" onClick={handleNext}>
                            Suivant
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                Passer
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting
                                    ? 'Envoi...'
                                    : photos.length > 0
                                        ? `Soumettre (${photos.length} photo${photos.length > 1 ? 's' : ''})`
                                        : 'Soumettre le compte rendu'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showSuccessAnimation && (
                <MarineApprovedOverlay
                    onAnimationComplete={() => {
                        setShowSuccessAnimation(false);
                        if (successMissionId) {
                            onSuccess(successMissionId);
                        }
                    }}
                />
            )}
        </div>
    );
}
