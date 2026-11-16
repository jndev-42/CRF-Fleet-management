'use client';

import { useState } from 'react';
import { CheckCircle, PenLine } from 'lucide-react';
import ElectronicSignatureModal, { type SignatureData } from '@/components/expenses/ElectronicSignatureModal';
import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

export interface ReportSignatures {
    team: SignatureData | null;
    organizer: SignatureData | null;
}

export interface SignedReportAppPanelProps {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
    signatures: ReportSignatures;
    onSignaturesChange: (patch: Partial<ReportSignatures>) => void;
    signerName: string;
}

type Signer = 'team' | 'organizer';

const CONSENT_TEXT = 'Je confirme signer électroniquement ce rapport de mission et certifie l’exactitude des informations qu’il contient.';

function formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function SignedCard({ signature, onRedo, label }: { signature: SignatureData; onRedo: () => void; label: string }) {
    return (
        <div className={styles.signedCard}>
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'une signature locale (data URL) */}
            <img className={styles.signedPreview} src={signature.image} alt={`Signature — ${label}`} />
            <div className={styles.signedMeta}>
                <CheckCircle size={14} aria-hidden="true" /> <strong>Signé</strong> par {signature.name}
                <div>le {formatDate(signature.date)}</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onRedo}>Refaire</button>
        </div>
    );
}

/** Sous-parcours « signé dans l'appli » : observations, signature de l'équipe, organisateur, signature de l'organisateur. */
export default function SignedReportAppPanel({ data, onChange, signatures, onSignaturesChange, signerName }: SignedReportAppPanelProps) {
    const [signing, setSigning] = useState<Signer | null>(null);
    const organizerReady = data.organizer_name.trim() !== '' && data.organizer_function.trim() !== '';

    // Nom ou fonction de l'organisateur modifiés : sa signature ne correspond plus, elle est à refaire.
    function handleOrganizerChange(patch: Partial<MissionFormData>) {
        const changed = (patch.organizer_name !== undefined && patch.organizer_name !== data.organizer_name)
            || (patch.organizer_function !== undefined && patch.organizer_function !== data.organizer_function);
        if (changed && signatures.organizer) onSignaturesChange({ organizer: null });
        onChange(patch);
    }

    function handleSign(signer: Signer, signature: SignatureData) {
        onSignaturesChange({ [signer]: signature });
        setSigning(null);
    }

    return (
        <div className={styles.appSection}>
            <p className={styles.stepSubtitle}>
                Le rapport de mission officiel est rempli avec les informations saisies, puis signé par vous et par l&apos;organisateur sur cet appareil.
                Horaires et responsable de la mission : étape « Général ».
            </p>

            <div className="form-group">
                <label className="form-label" htmlFor="crf_observations">Observations Croix-Rouge</label>
                <textarea
                    id="crf_observations"
                    className="form-input"
                    rows={4}
                    maxLength={2000}
                    value={data.crf_observations}
                    onChange={e => onChange({ crf_observations: e.target.value })}
                />
            </div>

            <h3 className={styles.appSectionTitle}>Responsable de l&apos;équipe</h3>
            {signatures.team ? (
                <SignedCard signature={signatures.team} label="responsable de l'équipe" onRedo={() => setSigning('team')} />
            ) : (
                <div>
                    <button type="button" className="btn btn-primary" onClick={() => setSigning('team')}>
                        <PenLine size={16} aria-hidden="true" /> Signer en tant que responsable de l&apos;équipe
                    </button>
                </div>
            )}

            <div className="form-group">
                <label className="form-label" htmlFor="organizer_observations">Observations organisateur</label>
                <textarea
                    id="organizer_observations"
                    className="form-input"
                    rows={4}
                    maxLength={2000}
                    value={data.organizer_observations}
                    onChange={e => onChange({ organizer_observations: e.target.value })}
                />
            </div>

            <div className={styles.fieldGrid}>
                <div className="form-group">
                    <label className="form-label" htmlFor="organizer_name">Nom de l&apos;organisateur *</label>
                    <input
                        id="organizer_name"
                        type="text"
                        className="form-input"
                        maxLength={200}
                        value={data.organizer_name}
                        onChange={e => handleOrganizerChange({ organizer_name: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="organizer_function">Fonction de l&apos;organisateur *</label>
                    <input
                        id="organizer_function"
                        type="text"
                        className="form-input"
                        maxLength={200}
                        value={data.organizer_function}
                        onChange={e => handleOrganizerChange({ organizer_function: e.target.value })}
                    />
                </div>
            </div>

            <h3 className={styles.appSectionTitle}>Responsable de l&apos;organisation</h3>
            {signatures.organizer ? (
                <SignedCard signature={signatures.organizer} label="responsable de l'organisation" onRedo={() => setSigning('organizer')} />
            ) : (
                <div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!organizerReady}
                        onClick={() => setSigning('organizer')}
                    >
                        <PenLine size={16} aria-hidden="true" /> Faire signer l&apos;organisateur
                    </button>
                    {!organizerReady && (
                        <p className={styles.fieldHint}>Renseignez le nom et la fonction de l&apos;organisateur pour recueillir sa signature.</p>
                    )}
                </div>
            )}

            <ElectronicSignatureModal
                isOpen={signing === 'team'}
                onClose={() => setSigning(null)}
                onSign={sig => handleSign('team', sig)}
                signerName={signerName || data.mission_lead_name}
                signerEmail=""
                roleTitle="Responsable de l'équipe"
                initialFunction="Responsable de l'équipe"
                actionVerb="continuer"
                consentText={CONSENT_TEXT}
            />
            <ElectronicSignatureModal
                isOpen={signing === 'organizer'}
                onClose={() => setSigning(null)}
                onSign={sig => handleSign('organizer', sig)}
                signerName={data.organizer_name}
                signerEmail=""
                roleTitle="Responsable de l'organisation"
                initialFunction={data.organizer_function}
                actionVerb="continuer"
                consentText={CONSENT_TEXT}
            />
        </div>
    );
}
