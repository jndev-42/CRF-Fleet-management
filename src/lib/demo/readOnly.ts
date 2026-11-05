/**
 * Règles du mode démo « lecture seule », partagées entre le client
 * (intercepteur de fetch) et le serveur (proxy). Module pur, compatible edge :
 * aucun import Node.
 */

export const DEMO_COOKIE_NAME = 'crf_demo_mode';
export const DEMO_COOKIE_VALUE = '1';
export const IS_DEMO_MODE_KEY = 'crf_is_demo_mode';
export const DEMO_SIMULATED_EVENT = 'crf-demo-simulated';
export const DEMO_READ_ONLY_ERROR = 'Mode démo : lecture seule';

/** Routes `/api/` toujours exécutées pour de vrai, même en démo. */
const EXEMPT_API_PREFIXES = [
    '/api/auth/',
    '/api/qr/',
    '/api/qr-ul/',
    '/api/qr-stock/',
    '/api/qr-uniforms/',
] as const;

/** Exports en POST qui ne font que lire, et signalement de bug. */
const EXEMPT_API_PATHS = [
    '/api/stats/csv',
    '/api/stats/pdf',
    '/api/stats/expenses/csv',
    '/api/stats/expenses/pdf',
    '/api/bugs/report',
] as const;

/** Écritures d'arrière-plan : simulées, mais sans notice « Action simulée ». */
const SILENT_API_PATHS = ['/api/push/subscriptions'] as const;

export function isDemoSilentApi(pathname: string): boolean {
    return (SILENT_API_PATHS as readonly string[]).includes(stripTrailingSlash(pathname));
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const QR_PAGE_RE = /^\/(qr|qr-ul|qr-stock|qr-uniforms)(\/|$)/;

function stripTrailingSlash(pathname: string): string {
    return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function isApiPath(pathname: string): boolean {
    return pathname === '/api' || pathname.startsWith('/api/');
}

/** Vrai pour les routes API qui restent réelles en démo. */
export function isDemoExemptApi(pathname: string): boolean {
    const path = stripTrailingSlash(pathname);
    if ((EXEMPT_API_PATHS as readonly string[]).includes(path)) return true;
    return EXEMPT_API_PREFIXES.some(
        (prefix) => pathname.startsWith(prefix) || pathname === prefix.slice(0, -1),
    );
}

/** Vrai pour toute méthode autre que GET / HEAD / OPTIONS. */
export function isDemoWriteMethod(method: string | undefined | null): boolean {
    return !SAFE_METHODS.has((method || 'GET').toUpperCase());
}

/** Pages QR publiques : la démo y est désactivée. */
export function isQrPage(pathname: string | null | undefined): boolean {
    return !!pathname && QR_PAGE_RE.test(pathname);
}

/** Une écriture `/api/` doit-elle être bloquée/simulée en démo ? */
export function isDemoBlockedRequest(pathname: string, method: string | undefined | null): boolean {
    return isApiPath(pathname) && isDemoWriteMethod(method) && !isDemoExemptApi(pathname);
}
