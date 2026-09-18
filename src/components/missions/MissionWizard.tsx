'use client';

import { useState } from 'react';
import { SUPPLY_CATEGORIES, type SupplyCategory } from '@/lib/mission-supplies';
import Step0ULSelection from './steps/Step0ULSelection';
import Step1General from './steps/Step1General';
import StepInterventionBreakdown from './steps/StepInterventionBreakdown';
import Step2Vehicle from './steps/Step2Vehicle';
import Step3Supplies from './steps/Step3Supplies';
import Step4Oxygen from './steps/Step4Oxygen';
import Step5Team from './steps/Step5Team';
import Step6Incidents from './steps/Step6Incidents';
import Step7SignedReport from './steps/Step7SignedReport';
import Step8Photos from './steps/Step8Photos';
import Step9Comment from './steps/Step9Comment';
import styles from './MissionWizard.module.css';
import MarineApprovedOverlay from '@/components/ui/MarineApprovedOverlay';
import { uploadFilesToDriveSafely } from '@/lib/imageCompression';

export interface MissionFormData {
    /** UL de rattachement du poste — exclusif avec `selected_dt_code`. */
    selected_ul_id: string | null;
    /** Code DT de rattachement (ex. « DT 75 ») — exclusif avec `selected_ul_id`. */
    selected_dt_code: string | null;
    mission_type: 'RESEAU' | 'DPS' | 'PAPS';
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string;
    pegass_ok: boolean;
    vehicle_id: string | null;
    driver_id: string | null;
    victim_count: number;
    presence_ul: boolean | null;
    team_dynamics: 'BIEN' | 'PLUTOT_BIEN' | 'PEUT_MIEUX' | 'SUJET' | null;
    all_found_place: boolean | null;
    member_difficulties: boolean | null;
    free_comment: string | null;
    mission_comment: string | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    /** Répartition du total d'interventions par type de prise en charge — clé = catégorie. */
    intervention_types: Record<string, number>;
    /** Répartition du total d'interventions par nature clinique — clé = catégorie. */
    intervention_natures: Record<string, number>;
}

const INITIAL_FORM: MissionFormData = {
    selected_ul_id: null,
    selected_dt_code: null,
    mission_type: 'RESEAU',
    mission_name: '',
    mission_date: new Date().toISOString().slice(0, 10),
    location: '',
    volunteers: '',
    pegass_ok: true,
    vehicle_id: null,
    driver_id: null,
    victim_count: 0,
    presence_ul: null,
    team_dynamics: null,
    all_found_place: null,
    member_difficulties: null,
    free_comment: null,
    mission_comment: null,
    had_acr: false,
    had_hemorrhage: false,
    had_complex_care: false,
    needs_followup: false,
    intervention_types: {},
    intervention_natures: {},
};

const MISSION_COMM_FOLDER_ID = '19ILEUHsq2pLZDwEeJDnhQcumFM9ztDJ3';
const SIGNED_REPORTS_FOLDER_ID = '1UQ0TxOLUCmL09m6evy1Ofoeuo2RaD2ki';

interface MissionWizardProps {
    currentUserId?: string;
    currentUserName?: string;
    /** Name of the submitter's home UL — used to label the "Présence UL ?" toggle in Step5Team */
    currentUserUlName?: string;
    onSuccess: (id: string) => void;
}

export default function MissionWizard({ currentUserId, currentUserName, currentUserUlName, onSuccess }: MissionWizardProps) {
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
        'UL / DT',
        'Général',
        ...(formData.victim_count >= 1 ? ['Répartition interventions'] : []),
        'Équipage',
        ...(!isExternalVehicle ? ['Matériel', 'Oxygène'] : []),
        'Équipe',
        'Incidents',
        ...(showReportStep ? ['Rapport signé'] : []),
        'Commentaire',
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

    function handleInterventionTypeChange(category: string, qty: number) {
        setFormData(prev => ({ ...prev, intervention_types: { ...prev.intervention_types, [category]: qty } }));
    }

    function handleInterventionNatureChange(category: string, qty: number) {
        setFormData(prev => ({ ...prev, intervention_natures: { ...prev.intervention_natures, [category]: qty } }));
    }

    /** Somme d'une grille de répartition (les catégories non saisies valent 0). */
    function breakdownTotal(values: Record<string, number>): number {
        return Object.values(values).reduce((acc, qty) => acc + (qty || 0), 0);
    }

    function validateStep(s: number): string | null {
        const label = activeSteps[s - 1];
        if (label === 'UL / DT') {
            if (!formData.selected_ul_id && !formData.selected_dt_code) {
                return 'Veuillez sélectionner l\'UL ou la Direction Territoriale qui héberge le poste.';
            }
        }
        if (label === 'Général') {
            if (!formData.mission_type) return 'Veuillez sélectionner un type de mission.';
            if (!formData.mission_name.trim()) return 'Le nom de la mission est requis.';
            if (!formData.mission_date) return 'La date est requise.';
            if (!formData.location.trim()) return 'Le lieu est requis.';
        }
        if (label === 'Répartition interventions') {
            const modeTotal = breakdownTotal(formData.intervention_types);
            const natureTotal = breakdownTotal(formData.intervention_natures);
            if (modeTotal !== formData.victim_count) {
                return `La répartition par type doit totaliser ${formData.victim_count} intervention${formData.victim_count > 1 ? 's' : ''} (actuellement ${modeTotal}).`;
            }
            if (natureTotal !== formData.victim_count) {
                return `La répartition par nature doit totaliser ${formData.victim_count} intervention${formData.victim_count > 1 ? 's' : ''} (actuellement ${natureTotal}).`;
            }
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

        // Répartition des interventions : seules les cases > 0 sont envoyées.
        // À 0 intervention les deux tableaux partent vides (invariant côté API).
        const toInterventionArr = (values: Record<string, number>) =>
            formData.victim_count >= 1
                ? Object.entries(values)
                    .filter(([, qty]) => qty > 0)
                    .map(([category, quantity]) => ({ category, quantity }))
                : [];
        const interventionTypesArr = toInterventionArr(formData.intervention_types);
        const interventionNaturesArr = toInterventionArr(formData.intervention_natures);

        // Upload the signed report (mandatory for DPS/PAPS)
        let signedReportDriveId: string | null = null;
        if (showReportStep && signedReportFile) {
            const uploadResult = await uploadFilesToDriveSafely({
                files: [signedReportFile],
                missionName: formData.mission_name,
                date: formData.mission_date,
                rootFolderId: SIGNED_REPORTS_FOLDER_ID,
                allowPdf: true,
            });

            if (!uploadResult.success) {
                setUploadError(uploadResult.error || 'Erreur lors de l\'upload du rapport signé.');
                setSubmitting(false);
                return;
            }
            signedReportDriveId = uploadResult.fileIds[0] ?? null;
        }

        // Upload communication photos to Drive if any were selected
        let driveFolderId: string | null = null;
        if (photos.length > 0) {
            const uploadResult = await uploadFilesToDriveSafely({
                files: photos,
                missionName: formData.mission_name,
                date: formData.mission_date,
                rootFolderId: MISSION_COMM_FOLDER_ID,
            });

            if (!uploadResult.success) {
                setUploadError(uploadResult.error || 'Erreur lors de l\'upload des photos.');
                setSubmitting(false);
                return;
            }
            driveFolderId = uploadResult.folderId || null;
        }

        try {
            const res = await fetch('/api/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    supplies: suppliesArr,
                    intervention_types: interventionTypesArr,
                    intervention_natures: interventionNaturesArr,
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
            // Show success animation only for Paris 18 UL — celle du POSTE choisi,
            // pas celle du soumetteur : c'est le rattachement du rapport qui compte.
            if (formData.selected_ul_id === 'ul-paris-18') {
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
            {currentStepLabel === 'UL / DT' && <Step0ULSelection data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Général' && <Step1General data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Répartition interventions' && (
                <StepInterventionBreakdown
                    victimCount={formData.victim_count}
                    interventionTypes={formData.intervention_types}
                    interventionNatures={formData.intervention_natures}
                    onTypeChange={handleInterventionTypeChange}
                    onNatureChange={handleInterventionNatureChange}
                />
            )}
            {currentStepLabel === 'Équipage' && <Step2Vehicle data={formData} onChange={patchFormData} currentUserId={currentUserId} currentUserName={currentUserName} />}
            {currentStepLabel === 'Matériel' && <Step3Supplies supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {currentStepLabel === 'Oxygène' && <Step4Oxygen supplies={supplies} onSupplyChange={handleSupplyChange} />}
            {currentStepLabel === 'Équipe' && <Step5Team data={formData} onChange={patchFormData} currentUserUlName={currentUserUlName} />}
            {currentStepLabel === 'Incidents' && <Step6Incidents data={formData} onChange={patchFormData} />}
            {currentStepLabel === 'Rapport signé' && <Step7SignedReport file={signedReportFile} onChange={setSignedReportFile} />}
            {currentStepLabel === 'Commentaire' && <Step9Comment data={formData} onChange={patchFormData} />}
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
