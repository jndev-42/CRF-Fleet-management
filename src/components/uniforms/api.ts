/**
 * Appel JSON de l'onglet Gestion. Renvoie le message d'erreur à afficher
 * inline, ou `null` en cas de succès.
 */
export async function sendJson(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
    try {
        const res = await fetch(url, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return data.error || 'Erreur serveur';
    } catch {
        return 'Erreur de connexion';
    }
}
