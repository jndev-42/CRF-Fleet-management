'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Step9Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
}

export default function Step9Comment({ data, onChange }: Step9Props) {
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
        </div>
    );
}
