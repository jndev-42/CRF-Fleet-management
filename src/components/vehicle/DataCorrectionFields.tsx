import type { CSSProperties } from 'react';
import FuelBar from '@/components/vehicle/FuelBar';
import { isMileageDecrease } from '@/lib/utils/mileageAnomaly';

interface DataCorrectionFieldsProps {
    /** Préfixe des `id` des champs — deux formulaires peuvent coexister dans le DOM. */
    idPrefix: string;
    /** Véhicule connecté : la case devient « Saisir manuellement… ». */
    connected: boolean;
    fuelType: string | null | undefined;
    dataIncorrect: boolean;
    /** Chaîne vide autorisée : un champ effacé reste vide (et `required` bloque la validation). */
    correctedMileage: number | '';
    correctedFuel: number;
    /** Kilométrage connu du véhicule : une saisie inférieure est signalée. */
    knownMileage: number;
    onDataIncorrectChange: (value: boolean) => void;
    onMileageChange: (value: number | '') => void;
    onFuelChange: (value: number) => void;
    style?: CSSProperties;
}

/**
 * Bloc « Le kilométrage et/ou le niveau d'essence est erroné » des deux formulaires
 * d'emprunt — modale de la fiche véhicule (`CheckOutModal`) et formulaire du QR code
 * (`src/app/qr/[token]/CheckOutForm.tsx`). Source unique : ne pas le recopier.
 */
export default function DataCorrectionFields({
    idPrefix,
    connected,
    fuelType,
    dataIncorrect,
    correctedMileage,
    correctedFuel,
    knownMileage,
    onDataIncorrectChange,
    onMileageChange,
    onFuelChange,
    style,
}: DataCorrectionFieldsProps) {
    const electric = fuelType === 'Électrique';
    const fuelLabel = electric ? 'Batterie' : (fuelType === 'Diesel' ? 'Diesel' : 'Essence');
    const decrease = correctedMileage !== '' && isMileageDecrease(correctedMileage, knownMileage);
    const mileageId = `${idPrefix}-corrected-mileage`;
    const fuelId = `${idPrefix}-corrected-fuel`;
    const decreaseId = `${idPrefix}-mileage-decrease`;

    return (
        <div
            style={{
                padding: '12px 14px',
                background: dataIncorrect ? 'var(--status-maintenance-bg)' : 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${dataIncorrect ? 'rgba(239,68,68,0.4)' : 'var(--border-primary)'}`,
                ...style,
            }}
        >
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                    type="checkbox"
                    checked={dataIncorrect}
                    onChange={e => onDataIncorrectChange(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>{connected ? 'Saisir manuellement le kilométrage/carburant' : 'Le kilométrage et/ou le niveau d\'essence est erroné'}</span>
            </label>

            {dataIncorrect && (
                <div className="form-row" style={{ marginTop: 14 }}>
                    <div className="form-group">
                        <label className="form-label" htmlFor={mileageId}>Kilométrage réel (km)</label>
                        <input
                            id={mileageId}
                            className="form-input"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={correctedMileage}
                            onChange={e => onMileageChange(e.target.value === '' ? '' : Number(e.target.value))}
                            required
                            aria-describedby={decrease ? decreaseId : undefined}
                        />
                        {decrease && (
                            <div id={decreaseId} className="form-hint" style={{ color: 'var(--error-text)' }}>
                                ⚠️ Inférieur au kilométrage connu ({knownMileage.toLocaleString('fr-FR')} km) : vérifiez la saisie, le compteur sera corrigé à la baisse.
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor={fuelId}>
                            {fuelLabel} réel : {correctedFuel}%
                        </label>
                        <input
                            id={fuelId}
                            type="range"
                            className="fuel-slider"
                            min={0}
                            max={100}
                            value={correctedFuel}
                            onChange={e => onFuelChange(Number(e.target.value))}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={correctedFuel}
                        />
                        <FuelBar level={correctedFuel} electric={electric} style={{ marginTop: 6 }} />
                    </div>
                </div>
            )}
        </div>
    );
}
