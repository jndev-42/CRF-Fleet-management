'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Step9Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
    /** Édition d'un DPS / PAPS : observations et organisateur du rapport restent modifiables. */
    showReportFields?: boolean;
}

export default function Step9Comment({ data, onChange, showReportFields = false }: Step9Props) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Commentaire libre</h2>
            <p className={styles.stepSubtitle}>
                Optionnel — ajoutez toute observation utile sur la mission.
            </p>

            <div className="form-group">
                <label className="form-label" htmlFor="mission_comment">Commentaire</label>
                <textarea
                    id="mission_comment"
                    className="form-input"
                    value={data.mission_comment ?? ''}
                    onChange={e => onChange({ mission_comment: e.target.value || null })}
                    rows={6}
                    placeholder="Observations, remarques..."
                />
            </div>

            {showReportFields && (
                <>
                    {([
                        ['crf_observations', 'Observations Croix-Rouge'],
                        ['organizer_observations', 'Observations organisateur'],
                    ] as const).map(([key, label]) => (
                        <div className="form-group" key={key}>
                            <label className="form-label" htmlFor={key}>{label}</label>
                            <textarea
                                id={key}
                                className="form-input"
                                rows={4}
                                maxLength={2000}
                                value={data[key]}
                                onChange={e => onChange({ [key]: e.target.value })}
                            />
                        </div>
                    ))}
                    {([
                        ['organizer_name', 'Nom de l\u2019organisateur'],
                        ['organizer_function', 'Fonction de l\u2019organisateur'],
                    ] as const).map(([key, label]) => (
                        <div className="form-group" key={key}>
                            <label className="form-label" htmlFor={key}>{label}</label>
                            <input
                                id={key}
                                type="text"
                                className="form-input"
                                maxLength={200}
                                value={data[key]}
                                onChange={e => onChange({ [key]: e.target.value })}
                            />
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
