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

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <span className="form-label" id="volunteer-accident-label">Accident bénévole</span>
                <p className={styles.fieldHint}>Un bénévole a-t-il été victime d&apos;un accident pendant la mission ?</p>
                <div className={styles.toggleRow} role="group" aria-labelledby="volunteer-accident-label">
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${data.volunteer_accident ? styles.toggleBtnActive : ''}`}
                        aria-pressed={data.volunteer_accident}
                        onClick={() => onChange({ volunteer_accident: true })}
                    >
                        Oui
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${!data.volunteer_accident ? styles.toggleBtnActive : ''}`}
                        aria-pressed={!data.volunteer_accident}
                        // Non : la description n'a plus lieu d'être, elle est vidée.
                        onClick={() => onChange({ volunteer_accident: false, volunteer_accident_details: '' })}
                    >
                        Non
                    </button>
                </div>
            </div>

            {data.volunteer_accident && (
                <div className="form-group">
                    <label className="form-label" htmlFor="volunteer-accident-details">
                        Description de l&apos;accident *
                    </label>
                    <textarea
                        id="volunteer-accident-details"
                        className="form-input"
                        value={data.volunteer_accident_details}
                        onChange={e => onChange({ volunteer_accident_details: e.target.value })}
                        rows={3}
                        placeholder="Circonstances, bénévole concerné, blessure, suites données…"
                        aria-required="true"
                    />
                    <span className={styles.fieldHint}>Obligatoire : le responsable mission de l&apos;UL est alerté.</span>
                </div>
            )}
        </div>
    );
}
