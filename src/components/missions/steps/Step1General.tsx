'use client';

import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Step1Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
}

export default function Step1General({ data, onChange }: Step1Props) {
    const isDps = data.mission_type === 'DPS' || data.mission_type === 'PAPS';
    // Obligatoires seulement si le rapport est signé dans l'appli ; facultatifs sinon.
    const star = data.signed_report_mode === 'APP' ? ' *' : '';
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Informations générales</h2>

            <div className="form-group">
                <label className="form-label">Type de mission *</label>
                <div className={styles.radioGroup}>
                    {(['RESEAU', 'DPS', 'PAPS'] as const).map(type => (
                        <label key={type} className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="mission_type"
                                value={type}
                                checked={data.mission_type === type}
                                onChange={() => onChange({ mission_type: type })}
                            />
                            <span>{type === 'RESEAU' ? 'Réseaux' : type}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="mission_name">Nom de la mission *</label>
                <input
                    id="mission_name"
                    type="text"
                    className="form-input"
                    value={data.mission_name}
                    onChange={e => onChange({ mission_name: e.target.value })}
                    placeholder="Ex : Poste Secours Fête de Quartier"
                />
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="mission_date">Date de la mission *</label>
                <input
                    id="mission_date"
                    type="date"
                    className="form-input"
                    value={data.mission_date}
                    onChange={e => onChange({ mission_date: e.target.value })}
                />
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="location">Lieu *</label>
                <input
                    id="location"
                    type="text"
                    className="form-input"
                    value={data.location}
                    onChange={e => onChange({ location: e.target.value })}
                    placeholder="Ex : Salle des fêtes Paris 18"
                />
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="victim_count">Nombre d&apos;intervention</label>
                <input
                    id="victim_count"
                    type="number"
                    className="form-input"
                    min={0}
                    value={data.victim_count}
                    onChange={e => onChange({ victim_count: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    style={{ maxWidth: '8rem' }}
                />
            </div>

            {isDps && (
                <>
                    <div className={styles.fieldGrid}>
                        {([
                            ['start_time', 'Heure de début'],
                            ['end_time', 'Heure de fin'],
                            ['arrival_time', 'Heure d\u2019arrivée sur place'],
                            ['departure_time', 'Heure de départ des lieux'],
                        ] as const).map(([key, label]) => (
                            <div className="form-group" key={key}>
                                <label className="form-label" htmlFor={key}>{label}{star}</label>
                                <input
                                    id={key}
                                    type="time"
                                    className="form-input"
                                    value={data[key]}
                                    onChange={e => onChange({ [key]: e.target.value })}
                                />
                            </div>
                        ))}
                    </div>
                    <div className={styles.fieldGrid}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="mission_lead_name">Responsable de la mission{star}</label>
                            <input
                                id="mission_lead_name"
                                type="text"
                                className="form-input"
                                maxLength={200}
                                value={data.mission_lead_name}
                                onChange={e => onChange({ mission_lead_name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="mission_lead_phone">Téléphone du responsable{star}</label>
                            <input
                                id="mission_lead_phone"
                                type="tel"
                                className="form-input"
                                maxLength={30}
                                value={data.mission_lead_phone}
                                onChange={e => onChange({ mission_lead_phone: e.target.value })}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
