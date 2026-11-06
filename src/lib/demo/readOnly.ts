/**
 * Règles du mode démo, partagées entre le client (intercepteur de fetch) et le
 * serveur (proxy, `db.ts`). Module pur : aucun import Node.
 *
 * Base démo configurée : les écritures s'appliquent à la base démo partagée ;
 * seules les routes à effet externe (`DEMO_EXTERNAL_WRITE_ROUTES`) restent simulées.
 * Base démo absente : toute écriture `/api/` non exemptée est refusée (garde-fou).
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

/**
 * Écritures hors base (Google Drive, R2, API Renault, abonnement Web Push) :
 * simulées par l'intercepteur et refusées (403) par le proxy en démo.
 * Toute nouvelle route qui écrit hors base doit rejoindre cette liste.
 */
export const DEMO_EXTERNAL_WRITE_ROUTES: readonly { pattern: RegExp; methods?: readonly string[] }[] = [
    { pattern: /^\/api\/drive\/upload$/ },
    { pattern: /^\/api\/referentiel\/upload$/ },
    { pattern: /^\/api\/referentiel\/process$/ },
    { pattern: /^\/api\/vehicles\/[^/]+\/documents$/, methods: ['POST'] },
    { pattern: /^\/api\/vehicles\/[^/]+\/documents\/[^/]+$/, methods: ['DELETE'] },
    { pattern: /^\/api\/vehicles\/[^/]+\/photo$/, methods: ['POST', 'DELETE'] },
    { pattern: /^\/api\/vehicles\/[^/]+\/connection$/ },
    { pattern: /^\/api\/trips\/[^/]+\/refresh-renault$/ },
    { pattern: /^\/api\/push\/subscriptions$/ },
];

/** Vrai pour une écriture vers une route à effet externe (simulée en démo). */
export function isDemoExternalWrite(pathname: string, method: string | undefined | null): boolean {
    if (!isDemoWriteMethod(method)) return false;
    const path = stripTrailingSlash(pathname);
    const m = (method || 'GET').toUpperCase();
    return DEMO_EXTERNAL_WRITE_ROUTES.some(
        (r) => r.pattern.test(path) && (!r.methods || r.methods.includes(m)),
    );
}

/** `libsql://` → `https://` : forme canonique d'une URL de base (comparaison prod/démo). */
export function normalizeDbUrl(url: string): string {
    const trimmed = url.trim();
    return trimmed.startsWith('libsql://') ? trimmed.replace(/^libsql:\/\//, 'https://') : trimmed;
}

/** L'URL démo désigne-t-elle la base de production ? (une recopie l'effacerait). */
export function isDemoDbSameAsProd(): boolean {
    const demo = process.env.TURSO_DEMO_DATABASE_URL?.trim();
    const prod = process.env.TURSO_DATABASE_URL?.trim();
    return !!demo && !!prod && normalizeDbUrl(demo) === normalizeDbUrl(prod);
}

/**
 * La base démo est-elle configurée ? Lue côté serveur (proxy Node, routes) ;
 * toujours fausse dans le navigateur (variable non publique). Une URL démo égale
 * à celle de la prod ne compte pas : c'est une erreur de configuration.
 */
export function isDemoDbConfigured(): boolean {
    return !!process.env.TURSO_DEMO_DATABASE_URL?.trim() && !isDemoDbSameAsProd();
}

/**
 * En-tête posé par `src/proxy.ts` sur une requête `/api/` démo : seule source de
 * vérité côté serveur (le cookie est partagé entre onglets, pas l'en-tête). Toute
 * valeur envoyée par le client est retirée par le proxy.
 */
export const DEMO_REQUEST_HEADER = 'x-crf-demo';

/** API jamais servies par la base démo, même avec le cookie : QR publics et authentification. */
const NON_DEMO_API_PREFIXES = ['/api/qr/', '/api/qr-ul/', '/api/qr-stock/', '/api/qr-uniforms/', '/api/auth/'] as const;

/** Une requête `/api/` portant le cookie de démo doit-elle être servie en démo ? */
export function isDemoEligibleApi(pathname: string): boolean {
    return isApiPath(pathname) && !NON_DEMO_API_PREFIXES.some(
        (prefix) => pathname.startsWith(prefix) || pathname === prefix.slice(0, -1),
    );
}

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

/**
 * Une écriture `/api/` doit-elle être bloquée (serveur) ou simulée (client) en démo ?
 * Base démo configurée : seulement les routes externes. Sinon : toute écriture non exemptée.
 */
export function isDemoBlockedRequest(
    pathname: string,
    method: string | undefined | null,
    demoDbConfigured: boolean,
): boolean {
    if (!isApiPath(pathname) || !isDemoWriteMethod(method)) return false;
    if (demoDbConfigured) return isDemoExternalWrite(pathname, method);
    return !isDemoExemptApi(pathname);
}
