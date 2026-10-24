/**
 * Chemins de l'API accessibles par l'outil générique `api_request` du serveur MCP.
 *
 * Un chemin n'est appelable que s'il figure au catalogue généré (`catalog.generated.ts`)
 * et hors des préfixes exclus : authentification, crons, le serveur MCP lui-même et la
 * gestion des jetons (une IA ne crée pas de jetons).
 */
import { MCP_API_CATALOG } from './catalog.generated';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface CatalogRoute {
    /** Chemin au format du système de fichiers Next.js, ex. `/api/vehicles/[id]`. */
    path: string;
    methods: readonly HttpMethod[];
}

/** Préfixes refusés : le chemin lui-même et tout ce qui est en dessous. */
export const EXCLUDED_API_PREFIXES = ['/api/auth', '/api/cron', '/api/mcp', '/api/mcp-tokens'] as const;

export function isExcludedApiPath(path: string): boolean {
    return EXCLUDED_API_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Chemin concret demandé par l'IA, normalisé ; `null` s'il est mal formé ou hors `/api/`.
 * Refuse les segments `.`/`..` (même encodés), les barres doubles, les paramètres de
 * route non résolus (`[id]`), la requête et le fragment (passés à part).
 */
export function normalizeApiPath(raw: string): string | null {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return null;
    if (!raw.startsWith('/api/')) return null;
    if (/[?#\\\s[\]]/.test(raw) || raw.includes('//')) return null;
    const path = raw.length > 5 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
    for (const segment of path.split('/').slice(1)) {
        let decoded: string;
        try {
            decoded = decodeURIComponent(segment);
        } catch {
            return null;
        }
        if (segment === '' || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) return null;
    }
    return path;
}

type SegmentKind = 0 | 1 | 2 | 3; // statique, [param], [...param], [[...param]]

function segmentKind(segment: string): SegmentKind {
    if (segment.startsWith('[[...')) return 3;
    if (segment.startsWith('[...')) return 2;
    if (segment.startsWith('[')) return 1;
    return 0;
}

/** Spécificité de la correspondance (plus petit = plus spécifique), `null` si pas de correspondance. */
function matchRoute(pattern: string, path: string): SegmentKind[] | null {
    const want = pattern.split('/').slice(1);
    const have = path.split('/').slice(1);
    const kinds: SegmentKind[] = [];
    for (let i = 0; i < want.length; i++) {
        const kind = segmentKind(want[i]);
        kinds.push(kind);
        if (kind === 2) return have.length > i ? kinds : null;
        if (kind === 3) return kinds;
        if (i >= have.length) return null;
        if (kind === 0 && want[i] !== have[i]) return null;
    }
    return have.length === want.length ? kinds : null;
}

function compareSpecificity(a: SegmentKind[], b: SegmentKind[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return b.length - a.length;
}

/**
 * Route du catalogue servie pour un chemin concret, comme Next.js la choisirait
 * (segments statiques avant dynamiques). `null` si le chemin est exclu ou inconnu.
 */
export function findCatalogRoute(path: string, catalog: readonly CatalogRoute[] = MCP_API_CATALOG): CatalogRoute | null {
    if (isExcludedApiPath(path)) return null;
    let best: { route: CatalogRoute; kinds: SegmentKind[] } | null = null;
    for (const route of catalog) {
        const kinds = matchRoute(route.path, path);
        if (kinds && (!best || compareSpecificity(kinds, best.kinds) < 0)) best = { route, kinds };
    }
    return best?.route ?? null;
}
