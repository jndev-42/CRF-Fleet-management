'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MissionFormData } from '../MissionWizard';
import styles from '../MissionWizard.module.css';

interface ULOption {
    id: string;
    name: string;
    dtCode: string | null;
}

interface Step0Props {
    data: MissionFormData;
    onChange: (patch: Partial<MissionFormData>) => void;
}

/** Valeur du `<select>` : préfixée par type pour qu'une UL et une DT homonymes
 *  ne puissent jamais se confondre dans une liste plate. */
const UL_PREFIX = 'ul:';
const DT_PREFIX = 'dt:';

export default function Step0ULSelection({ data, onChange }: Step0Props) {
    const [uls, setUls] = useState<ULOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Un échec de chargement bloquerait l'étape 1 définitivement : elle n'a pas de
    // « Précédent » et « Suivant » exige une sélection. Incrémenter ce compteur
    // relance l'effet de chargement.
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        (async () => {
            try {
                const res = await fetch('/api/ul');
                if (!res.ok) throw new Error('fetch failed');
                const body = await res.json();
                if (!cancelled) setUls(body.uls ?? []);
            } catch {
                if (!cancelled) setLoadError('Impossible de charger la liste des UL. Veuillez réessayer.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [reloadKey]);

    // Les DT ne sont pas stockées : elles se déduisent des `dtCode` distincts
    // renseignés sur les UL (cf. la datalist de l'écran d'administration des UL).
    const dtCodes = useMemo(
        () => Array.from(new Set(uls.map(u => u.dtCode?.trim()).filter((c): c is string => Boolean(c)))).sort(),
        [uls],
    );

    const selectValue = data.selected_ul_id
        ? `${UL_PREFIX}${data.selected_ul_id}`
        : data.selected_dt_code
            ? `${DT_PREFIX}${data.selected_dt_code}`
            : '';

    function handleSelect(value: string) {
        // Exclusivité stricte : choisir l'un efface toujours l'autre.
        if (value.startsWith(UL_PREFIX)) {
            onChange({ selected_ul_id: value.slice(UL_PREFIX.length), selected_dt_code: null });
        } else if (value.startsWith(DT_PREFIX)) {
            onChange({ selected_ul_id: null, selected_dt_code: value.slice(DT_PREFIX.length) });
        } else {
            onChange({ selected_ul_id: null, selected_dt_code: null });
        }
    }

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Structure du poste</h2>
            <p className={styles.stepSubtitle}>
                Sélectionnez l&apos;UL ou la Direction Territoriale qui héberge ce poste. Le compte rendu
                lui restera rattaché, même si vous changez d&apos;UL active par la suite.
            </p>

            {loadError && (
                <div className={styles.errorBox} role="alert">
                    {loadError}
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginLeft: '0.75rem' }}
                        onClick={() => setReloadKey(k => k + 1)}
                        disabled={loading}
                    >
                        Réessayer
                    </button>
                </div>
            )}

            <div className="form-group">
                <label className="form-label" htmlFor="ul_selection">Structure de rattachement *</label>
                <select
                    id="ul_selection"
                    className="form-input"
                    value={selectValue}
                    disabled={loading}
                    onChange={e => handleSelect(e.target.value)}
                >
                    <option value="">{loading ? 'Chargement...' : '— Sélectionner —'}</option>
                    {uls.length > 0 && (
                        <optgroup label="Unités Locales">
                            {uls.map(ul => (
                                <option key={ul.id} value={`${UL_PREFIX}${ul.id}`}>{ul.name}</option>
                            ))}
                        </optgroup>
                    )}
                    {dtCodes.length > 0 && (
                        <optgroup label="Directions Territoriales">
                            {dtCodes.map(dt => (
                                <option key={dt} value={`${DT_PREFIX}${dt}`}>{dt}</option>
                            ))}
                        </optgroup>
                    )}
                </select>
                <span className={styles.fieldHint}>
                    Choisissez une Direction Territoriale pour un poste de niveau DT, sans UL de rattachement.
                </span>
            </div>
        </div>
    );
}
