import {
    DEMO_SIMULATED_EVENT,
    IS_DEMO_MODE_KEY,
    isDemoBlockedRequest,
    isDemoSilentApi,
    isQrPage,
} from './readOnly';

const INSTALLED_FLAG = '__crfDemoFetchInstalled';

/** Chemin d'une URL relative ou absolue (hors origine). */
function pathnameOf(url: string): string {
    try {
        return new URL(url, window.location.origin).pathname;
    } catch {
        return url;
    }
}

/**
 * En mode démo, les lectures passent vers la vraie API ; les écritures `/api/`
 * (hors exemptions et hors pages QR) sont simulées : aucun appel réseau.
 * Installation idempotente.
 */
export function setupFetchInterceptor() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    if (w[INSTALLED_FLAG]) return;
    w[INSTALLED_FLAG] = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        let isDemo = false;
        try {
            isDemo = localStorage.getItem(IS_DEMO_MODE_KEY) === 'true';
        } catch {
            // localStorage indisponible : pas de démo
        }
        if (!isDemo || isQrPage(window.location.pathname)) return originalFetch(input, init);

        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');

        const pathname = pathnameOf(url);
        if (!isDemoBlockedRequest(pathname, method)) return originalFetch(input, init);

        if (!isDemoSilentApi(pathname)) window.dispatchEvent(new CustomEvent(DEMO_SIMULATED_EVENT));
        return new Response(JSON.stringify({ success: true, simulated: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };
}
