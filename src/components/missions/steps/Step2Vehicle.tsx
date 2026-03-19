'use client';

import { useEffect, useState } from 'react';
import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface Vehicle {
    id: string;
    name: string;
    type: string | null;
}

interface Driver {
    id: string;
    name: string | null;
    email: string;
}

interface Step2Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
    currentUserId?: string;
    currentUserName?: string;
}

export default function Step2Vehicle({ data, onChange, currentUserId, currentUserName }: Step2Props) {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);

    useEffect(() => {
        async function load() {
            try {
                const [vRes, dRes] = await Promise.all([
                    fetch('/api/vehicles'),
                    fetch('/api/users?drivers=true'),
                ]);
                if (vRes.ok) {
                    const vData = await vRes.json();
                    setVehicles(Array.isArray(vData) ? vData : vData.vehicles ?? []);
                }
                if (dRes.ok) {
                    const dData = await dRes.json();
                    setDrivers(dData.users ?? []);
                }
            } catch (e) {
                console.error('Erreur chargement véhicules/chauffeurs', e);
            }
        }
        load();
    }, []);

    const volunteersRequired = !data.pegass_ok;

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Véhicule et équipage</h2>

            <div className="form-group">
                <label className="form-label" htmlFor="vehicle_id">Véhicule utilisé</label>
                <select
                    id="vehicle_id"
                    className="form-input"
                    value={data.vehicle_id ?? ''}
                    onChange={e => onChange({ vehicle_id: e.target.value || null })}
                >
                    <option value="">— Aucun / non renseigné —</option>
                    {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.name}{v.type ? ` (${v.type})` : ''}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="driver_id">Chauffeur</label>
                <select
                    id="driver_id"
                    className="form-input"
                    value={data.driver_id ?? ''}
                    onChange={e => onChange({ driver_id: e.target.value || null })}
                >
                    <option value="">— Non renseigné —</option>
                    {currentUserId && (
                        <option value={currentUserId}>Moi ({currentUserName ?? 'moi'})</option>
                    )}
                    {drivers
                        .filter(d => d.id !== currentUserId)
                        .map(d => (
                            <option key={d.id} value={d.id}>{d.name ?? d.email}</option>
                        ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Inscriptions Pegass à jour ?</label>
                <div className={styles.toggleRow}>
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${data.pegass_ok ? styles.toggleBtnActive : ''}`}
                        onClick={() => onChange({ pegass_ok: true })}
                    >
                        Oui
                    </button>
                    <button
                        type="button"
                        className={`${styles.toggleBtn} ${!data.pegass_ok ? styles.toggleBtnActive : ''}`}
                        onClick={() => onChange({ pegass_ok: false })}
                    >
                        Non
                    </button>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="volunteers">
                    Bénévoles présents{volunteersRequired ? ' *' : ''}
                </label>
                <textarea
                    id="volunteers"
                    className="form-input"
                    value={data.volunteers}
                    onChange={e => onChange({ volunteers: e.target.value })}
                    rows={3}
                    placeholder="Ex : Moi, Marie Dupont, Jean Martin"
                />
                <span className={styles.fieldHint}>
                    {volunteersRequired
                        ? 'Requis car inscriptions Pegass non à jour.'
                        : 'Optionnel.'}
                </span>
            </div>
        </div>
    );
}
