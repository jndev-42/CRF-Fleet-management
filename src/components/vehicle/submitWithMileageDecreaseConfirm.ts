import { MILEAGE_DECREASE_CONFIRM_REQUIRED } from '@/lib/utils/mileageAnomaly';

/**
 * Envoie un emprunt en gérant la confirmation d'un kilométrage corrigé à la baisse,
 * pour les deux formulaires d'emprunt (modale de la fiche véhicule, formulaire QR).
 *
 * `send(false)` part d'abord sans confirmation. Si le serveur répond 400
 * `MILEAGE_DECREASE_CONFIRM_REQUIRED`, son message est soumis à l'utilisateur ; s'il
 * confirme, `send(true)` renvoie avec `confirmMileageDecrease`. Retourne la réponse
 * finale, ou `null` si l'utilisateur a annulé.
 */
export async function submitWithMileageDecreaseConfirm(
    send: (confirmMileageDecrease: boolean) => Promise<Response>,
    confirmQuestion: string,
): Promise<Response | null> {
    const res = await send(false);
    if (res.status !== 400) return res;

    const data = await res.clone().json().catch(() => ({}));
    if (data.code !== MILEAGE_DECREASE_CONFIRM_REQUIRED) return res;

    if (!window.confirm(`${data.error}\n\n${confirmQuestion}`)) return null;
    return send(true);
}
