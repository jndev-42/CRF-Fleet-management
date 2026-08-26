import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface MileageAnomalyModalProps {
    /** Kilomètres parcourus (mileageIn − mileageOut). */
    delta: number;
    /** Durée réelle écoulée depuis le départ, déjà formatée (« 5 h », « 1 jour et 12 h »). */
    durationLabel: string;
    /** Plafond appliqué, en km. */
    maxKm: number;
    onCancel: () => void;
    onConfirm: () => void;
}

/**
 * Double confirmation avant d'enregistrer un kilométrage de retour inhabituel.
 *
 * Rendue en modale imbriquée dans `CheckInModal` (overlay parent) et en premier overlay
 * du parcours QR. `zIndex: 10001` et `stopPropagation` sur l'overlay sont indispensables :
 * sans eux, un clic sur le fond remonte au `.modal-overlay` parent et ferme tout le
 * formulaire de retour, effaçant la saisie en cours.
 */
export default function MileageAnomalyModal({
    delta,
    durationLabel,
    maxKm,
    onCancel,
    onConfirm,
}: MileageAnomalyModalProps) {
    useEscapeKey(onCancel);

    return (
        <div
            className="modal-overlay"
            style={{ zIndex: 10001 }}
            onClick={(e) => {
                e.stopPropagation();
                onCancel();
            }}
        >
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-mileage-anomaly-title"
                style={{ maxWidth: '500px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-mileage-anomaly-title" className="modal-title">
                        ⚠️ Kilométrage inhabituel
                    </h2>
                    <button className="modal-close" onClick={onCancel} aria-label="Fermer la modale">✕</button>
                </div>
                <div className="modal-body">
                    <p>
                        {delta} km parcourus en {durationLabel}. Plafond attendu : {maxKm} km.
                        <br />
                        Vérifiez la saisie.
                    </p>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus>
                        Corriger
                    </button>
                    <button type="button" className="btn btn-primary" onClick={onConfirm}>
                        Confirmer quand même
                    </button>
                </div>
            </div>
        </div>
    );
}
