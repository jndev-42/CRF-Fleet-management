'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Step5Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
}

type TeamDynamics = 'BIEN' | 'PLUTOT_BIEN' | 'PEUT_MIEUX' | 'SUJET';

const TEAM_DYNAMICS_OPTIONS: Array<{ value: TeamDynamics; label: string }> = [
    { value: 'BIEN', label: 'Bien' },
    { value: 'PLUTOT_BIEN', label: 'Plutôt bien' },
    { value: 'PEUT_MIEUX', label: 'Peut mieux faire' },
    { value: 'SUJET', label: 'Sujet à traiter' },
];

export default function Step5Team({ data, onChange }: Step5Props) {
    const showDynamicsFields = data.ul18_present === true;

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Composition et dynamique d&apos;équipe</h2>

            <div className="form-group">
                <label className="form-label">Présence UL 18 ?</label>
                <div className={styles.toggleRow}>
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${data.ul18_present === true ? styles.toggleBtnActive : ''}`}
                        onClick={() => onChange({ ul18_present: true })}
                    >
                        Oui
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${data.ul18_present === false ? styles.toggleBtnActive : ''}`}
                        onClick={() => onChange({ ul18_present: false, team_dynamics: null, all_found_place: null, member_difficulties: null, free_comment: null })}
                    >
                        Non
                    </button>
                </div>
            </div>

            {showDynamicsFields && (
                <>
                    <div className="form-group">
                        <label className="form-label">Dynamique d&apos;équipe *</label>
                        <div className={styles.radioGroup}>
                            {TEAM_DYNAMICS_OPTIONS.map(opt => (
                                <label key={opt.value} className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="team_dynamics"
                                        value={opt.value}
                                        checked={data.team_dynamics === opt.value}
                                        onChange={() => onChange({ team_dynamics: opt.value })}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Chacun a trouvé sa place dans l&apos;équipe ?</label>
                        <div className={styles.toggleRow}>
                            <button type="button" className={`${styles.toggleBtn} ${data.all_found_place === true ? styles.toggleBtnActive : ''}`} onClick={() => onChange({ all_found_place: true })}>Oui</button>
                            <button type="button" className={`${styles.toggleBtn} ${data.all_found_place === false ? styles.toggleBtnActive : ''}`} onClick={() => onChange({ all_found_place: false })}>Non</button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Un ou plusieurs membres en difficulté ?</label>
                        <div className={styles.toggleRow}>
                            <button type="button" className={`${styles.toggleBtn} ${data.member_difficulties === true ? styles.toggleBtnActive : ''}`} onClick={() => onChange({ member_difficulties: true })}>Oui</button>
                            <button type="button" className={`${styles.toggleBtn} ${data.member_difficulties === false ? styles.toggleBtnActive : ''}`} onClick={() => onChange({ member_difficulties: false })}>Non</button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="free_comment">Commentaire libre</label>
                        <textarea
                            id="free_comment"
                            className="form-input"
                            value={data.free_comment ?? ''}
                            onChange={e => onChange({ free_comment: e.target.value || null })}
                            rows={3}
                            placeholder="Observations, points d'amélioration..."
                        />
                    </div>
                </>
            )}
        </div>
    );
}
