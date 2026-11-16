'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';
import SignedReportPhotoPanel from './SignedReportPhotoPanel';
import SignedReportAppPanel, { type ReportSignatures } from './SignedReportAppPanel';

export type SignedReportMode = 'PHOTO' | 'APP' | 'NONE';

export const NO_REPORT_WARNING = 'L’UL est responsable de l’absence de rapport de mission signé';

const MODE_OPTIONS: { value: SignedReportMode; label: string }[] = [
    { value: 'PHOTO', label: 'Prendre en photo le rapport papier signé' },
    { value: 'APP', label: 'Signer / faire signer le rapport dans l’appli' },
    { value: 'NONE', label: 'Ne pas fournir de rapport' },
];

export interface Step7SignedReportProps {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
    file: File | null;
    onFileChange: (file: File | null) => void;
    signatures: ReportSignatures;
    onSignaturesChange: (patch: Partial<ReportSignatures>) => void;
    signerName: string;
}

/** Étape « Rapport signé » (DPS / PAPS) : trois façons de fournir — ou non — le rapport signé. */
export default function Step7SignedReport({
    data, onChange, file, onFileChange, signatures, onSignaturesChange, signerName,
}: Step7SignedReportProps) {
    const mode = data.signed_report_mode;

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Rapport signé</h2>

            <div className={styles.modeList} role="radiogroup" aria-label="Mode du rapport signé">
                {MODE_OPTIONS.map(opt => (
                    <label
                        key={opt.value}
                        className={`${styles.modeOption} ${mode === opt.value ? styles.modeOptionActive : ''}`}
                    >
                        <input
                            type="radio"
                            name="signed_report_mode"
                            value={opt.value}
                            checked={mode === opt.value}
                            onChange={() => onChange({ signed_report_mode: opt.value })}
                        />
                        <span>{opt.label}</span>
                    </label>
                ))}
            </div>

            {mode === 'PHOTO' && <SignedReportPhotoPanel file={file} onChange={onFileChange} />}
            {mode === 'APP' && (
                <SignedReportAppPanel
                    data={data}
                    onChange={onChange}
                    signatures={signatures}
                    onSignaturesChange={onSignaturesChange}
                    signerName={signerName}
                />
            )}
            {mode === 'NONE' && (
                <div className={styles.warningBox} role="alert">{NO_REPORT_WARNING}</div>
            )}
        </div>
    );
}
