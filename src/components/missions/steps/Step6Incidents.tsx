'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Step6Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
}

export default function Step6Incidents({ data, onChange }: Step6Props) {
    const hasIncident = data.had_acr || data.had_hemorrhage || data.had_complex_care;

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Incidents critiques</h2>
            <p className={styles.stepSubtitle}>Cochez les situations rencontrées lors de cette mission.</p>

            <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={data.had_acr}
                        onChange={e => onChange({ had_acr: e.target.checked })}
                    />
                    <span>Arrêt cardio-respiratoire (ACR)</span>
                </label>

                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={data.had_hemorrhage}
                        onChange={e => onChange({ had_hemorrhage: e.target.checked })}
                    />
                    <span>Hémorragie grave</span>
                </label>

                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={data.had_complex_care}
                        onChange={e => onChange({ had_complex_care: e.target.checked })}
                    />
                    <span>Prise en charge complexe</span>
                </label>
            </div>

            {hasIncident && (
                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                    <label className="form-label">Suivi nécessaire ?</label>
                    <p className={styles.fieldHint}>Un ou plusieurs membres de l&apos;équipe nécessitent-ils un suivi psychologique ou opérationnel ?</p>
                    <div className={styles.toggleRow}>
                        <button
                            type="button"
                            className={`${styles.toggleBtn} ${data.needs_followup ? styles.toggleBtnActive : ''}`}
                            onClick={() => onChange({ needs_followup: true })}
                        >
                            Oui
                        </button>
                        <button
                            type="button"
                            className={`${styles.toggleBtn} ${!data.needs_followup ? styles.toggleBtnActive : ''}`}
                            onClick={() => onChange({ needs_followup: false })}
                        >
                            Non
                        </button>
                    </div>
                </div>
            )}

            {!hasIncident && (
                <p className={styles.noIncidentNote}>
                    Aucun incident critique à signaler — la question de suivi ne s&apos;affiche que si un incident est coché.
                </p>
            )}
        </div>
    );
}
