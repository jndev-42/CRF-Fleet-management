import FuelBar from '@/components/vehicle/FuelBar';

/**
 * Bloc « Le kilométrage et/ou le niveau d'essence est erroné » du formulaire d'emprunt QR.
 * Pendant de la section correspondante de `CheckOutModal` : une case à cocher, puis la
 * saisie du kilométrage réel et du niveau réel une fois la case cochée.
 */
export default function DataCorrectionFields({
    connected,
    fuelType,
    dataIncorrect,
    correctedMileage,
    correctedFuel,
    onDataIncorrectChange,
    onMileageChange,
    onFuelChange,
}: {
    connected: boolean;
    fuelType: string | null;
    dataIncorrect: boolean;
    correctedMileage: number | '';
    correctedFuel: number;
    onDataIncorrectChange: (value: boolean) => void;
    onMileageChange: (value: number | '') => void;
    onFuelChange: (value: number) => void;
}) {
    const electric = fuelType === 'Électrique';
    const fuelLabel = electric ? 'Batterie' : (fuelType === 'Diesel' ? 'Diesel' : 'Essence');

    return (
        <div style={{
            padding: '12px 14px',
            background: dataIncorrect ? 'var(--status-maintenance-bg)' : 'var(--bg-card)',
            borderRadius: 8,
            border: `1px solid ${dataIncorrect ? 'rgba(239,68,68,0.4)' : 'var(--border-primary)'}`,
        }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                    <div>
                        <label htmlFor="qr-checkout-corrected-mileage" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            Kilométrage réel (km)
                        </label>
                        <input
                            id="qr-checkout-corrected-mileage"
                            className="form-input"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={correctedMileage}
                            onChange={e => onMileageChange(e.target.value === '' ? '' : Number(e.target.value))}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="qr-checkout-corrected-fuel" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            {fuelLabel} réel : {correctedFuel}%
                        </label>
                        <input
                            id="qr-checkout-corrected-fuel"
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
