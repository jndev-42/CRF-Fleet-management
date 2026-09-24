/**
 * Événement fenêtre émis après un emprunt, un rendu ou un lavage.
 *
 * La card « Mes pièces empruntées », la liste « À laver » et le catalogue sont
 * des composants indépendants : l'événement les rafraîchit tous après une
 * action faite dans l'un d'eux, sans sondage périodique.
 */
export const UNIFORMS_CHANGED_EVENT = 'uniforms-changed';

export function notifyUniformsChanged(): void {
    window.dispatchEvent(new Event(UNIFORMS_CHANGED_EVENT));
}

/** Date courte FR (« 24/09/2026 14:05 ») ; la chaîne brute si illisible. */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
