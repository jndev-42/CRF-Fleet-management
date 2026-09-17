/**
 * NextAuth fournit `callbackUrl` en URL absolue (ex: `https://host/qr/AbCd1234`)
 * lors de sa redirection automatique vers `/login`, jamais en chemin relatif :
 * un simple `startsWith('/')` la rejette donc toujours et retombe sur `/`.
 *
 * `host` doit provenir du header `host` (ou `x-forwarded-host`) de la requête
 * courante — la même source de confiance que celle utilisée par le middleware
 * NextAuth pour construire `callbackUrl` au départ, donc pas une nouvelle
 * frontière de confiance introduite ici.
 */
export function resolveCallbackUrl(rawCallback: string, host: string | null): string {
    if (rawCallback.startsWith('/') && !rawCallback.startsWith('//')) return rawCallback;

    try {
        const url = new URL(rawCallback);
        if (host && url.host === host) return `${url.pathname}${url.search}`;
    } catch {
        // rawCallback n'est ni un chemin relatif ni une URL absolue valide
    }
    return '/';
}
