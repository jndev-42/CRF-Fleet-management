/**
 * Outils du serveur MCP (`/api/mcp`) : `whoami`, `list_api_routes`, `api_request`.
 *
 * `api_request` rejoue la requête de l'IA sur l'API REST de l'application, avec une
 * assertion interne signée à la place du jeton (`assertion.ts`) : la route appelée
 * applique ses propres contrôles (rôles, UL, Zod) et `withAudit` trace l'écriture au
 * nom du propriétaire du jeton.
 */
import { z } from 'zod';
import { MCP_API_CATALOG } from './catalog.generated';
import { MCP_ASSERTION_HEADER, signMcpAssertion } from './assertion';
import { HTTP_METHODS, findCatalogRoute, normalizeApiPath, type CatalogRoute } from './routes';
import type { McpPrincipal } from './tokens';

/**
 * Origine des appels internes, tirée de l'environnement : l'assertion signée ne doit jamais
 * partir vers un hôte choisi par la requête (en-tête Host forgé). Ordre : `MCP_INTERNAL_ORIGIN`,
 * puis sur Vercel le domaine de production (`VERCEL_ENV=production`) ou l'URL du déploiement,
 * et en dernier recours seulement (développement local) l'origine de la requête.
 */
export function internalOrigin(req: Request, env: Record<string, string | undefined> = process.env): string {
    if (env.MCP_INTERNAL_ORIGIN) return env.MCP_INTERNAL_ORIGIN;
    if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
    if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
    return new URL(req.url).origin;
}

/** Au-delà, l'appel interne est abandonné (avant que la plateforme ne coupe la fonction). */
export const INTERNAL_FETCH_TIMEOUT_MS = 50_000;

/** Au-delà, la réponse transmise à l'IA est tronquée (avec mention). */
export const MAX_RESPONSE_CHARS = 100_000;
const MAX_BODY_CHARS = 1_000_000;

export interface ToolResult {
    [key: string]: unknown;
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

function text(value: string, isError = false): ToolResult {
    return isError ? { content: [{ type: 'text', text: value }], isError: true } : { content: [{ type: 'text', text: value }] };
}

const queryValue = z.union([z.string(), z.number(), z.boolean()]);

export const apiRequestInput = z.object({
    method: z.enum(HTTP_METHODS).describe('Méthode HTTP'),
    path: z.string().min(1).describe('Chemin concret de la route, paramètres résolus, ex. /api/vehicles/VL186 (jamais /api/vehicles/[id])'),
    query: z.record(z.string(), z.union([queryValue, z.array(queryValue)])).optional()
        .describe('Paramètres de requête (?clé=valeur), facultatifs'),
    body: z.unknown().optional().describe('Corps JSON de la requête (POST, PUT, PATCH, DELETE) ; pas de dépôt de fichier'),
});
export type ApiRequestInput = z.infer<typeof apiRequestInput>;

export const listApiRoutesInput = z.object({
    filter: z.string().max(200).optional().describe('Texte à rechercher dans le chemin, ex. « vehicles »'),
});

/** User-Agent des appels internes ; un en-tête HTTP n'accepte que l'ASCII imprimable. */
export function mcpUserAgent(tokenName: string): string {
    const ascii = tokenName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/gu, '_').trim();
    return `CRF-MCP/${ascii || 'jeton'}`.slice(0, 200);
}

export function whoami(principal: McpPrincipal): ToolResult {
    const home = principal.availableULs.find(ul => ul.id === principal.ulId);
    return text(JSON.stringify({
        email: principal.email,
        name: principal.name,
        roles: principal.roles,
        ul: home ? { id: home.id, name: home.name } : { id: principal.ulId, name: null },
        token: {
            name: principal.tokenName,
            scope: principal.scope === 'write' ? 'lecture-écriture' : 'lecture seule',
            expiresAt: principal.expiresAt,
        },
    }, null, 2));
}

export function listApiRoutes(principal: McpPrincipal, filter?: string, catalog: readonly CatalogRoute[] = MCP_API_CATALOG): ToolResult {
    const needle = filter?.trim().toLowerCase();
    const routes = needle ? catalog.filter(r => r.path.toLowerCase().includes(needle)) : catalog;
    const lines = routes.map(r => `${r.methods.join(', ').padEnd(26)} ${r.path}`);
    const header = principal.scope === 'write'
        ? 'Routes appelables avec api_request (remplacer les [paramètres] par leur valeur) :'
        : 'Routes appelables avec api_request (jeton en lecture seule : GET uniquement ; remplacer les [paramètres] par leur valeur) :';
    return text(lines.length ? `${header}\n${lines.join('\n')}` : 'Aucune route ne correspond à ce filtre.');
}

function buildUrl(origin: string, path: string, query: ApiRequestInput['query']): string {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query ?? {})) {
        for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
    }
    return url.toString();
}

function truncate(value: string): string {
    if (value.length <= MAX_RESPONSE_CHARS) return value;
    return `${value.slice(0, MAX_RESPONSE_CHARS)}\n\n[… réponse tronquée : ${value.length} caractères au total, ${MAX_RESPONSE_CHARS} affichés. Affiner la requête (filtres, pagination).]`;
}

function isTextual(contentType: string): boolean {
    return contentType === '' || /json|^text\/|xml|javascript|csv/i.test(contentType);
}

/**
 * Exécute `api_request`. Aucun appel HTTP n'est fait pour une écriture avec un jeton
 * en lecture seule, un chemin non autorisé ou une méthode absente de la route.
 */
export async function apiRequest(
    principal: McpPrincipal,
    input: ApiRequestInput,
    origin: string,
    fetchImpl: typeof fetch = fetch,
): Promise<ToolResult> {
    const method = input.method;
    if (principal.scope !== 'write' && method !== 'GET') {
        return text('Refusé : jeton en lecture seule — seules les requêtes GET sont autorisées.', true);
    }

    const path = normalizeApiPath(input.path);
    const route = path ? findCatalogRoute(path) : null;
    if (!path || !route) {
        return text(`Refusé : chemin non autorisé (${input.path}). Utiliser list_api_routes pour voir les routes disponibles.`, true);
    }
    if (!route.methods.includes(method)) {
        return text(`Refusé : la route ${route.path} n'accepte pas ${method} (méthodes : ${route.methods.join(', ')}).`, true);
    }

    let body: string | undefined;
    if (input.body !== undefined) {
        if (method === 'GET') return text('Refusé : une requête GET ne prend pas de corps — utiliser `query`.', true);
        body = JSON.stringify(input.body);
        if (body.length > MAX_BODY_CHARS) return text('Refusé : corps de requête trop volumineux.', true);
    }

    const headers: Record<string, string> = {
        [MCP_ASSERTION_HEADER]: signMcpAssertion({ userId: principal.userId, tokenId: principal.tokenId, scope: principal.scope }, method),
        'user-agent': mcpUserAgent(principal.tokenName),
        accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    // Previews Vercel : la protection de déploiement bloquerait l'appel interne.
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

    let res: Response;
    try {
        res = await fetchImpl(buildUrl(origin, path, input.query), {
            method, headers, body, redirect: 'manual', cache: 'no-store',
            signal: AbortSignal.timeout(INTERNAL_FETCH_TIMEOUT_MS),
        });
    } catch (e: unknown) {
        // DOMException : pas toujours une instance d'Error selon l'environnement, d'où le test sur le nom.
        const name = e && typeof e === 'object' && 'name' in e ? (e as { name: unknown }).name : undefined;
        if (name === 'TimeoutError' || name === 'AbortError') {
            return text(`Délai dépassé : la route n'a pas répondu en ${INTERNAL_FETCH_TIMEOUT_MS / 1000} secondes.`, true);
        }
        return text(`Appel impossible : ${e instanceof Error ? e.message : String(e)}`, true);
    }

    const contentType = res.headers.get('content-type') ?? '';
    let payload: string;
    if (isTextual(contentType)) {
        payload = truncate(await res.text());
    } else {
        // Réponse binaire (PDF, image…) : résumée, jamais transmise.
        const size = (await res.arrayBuffer()).byteLength;
        payload = `[Réponse binaire non transmise : type ${contentType}, ${size} octets]`;
    }
    return text(`HTTP ${res.status}\n\n${payload}`, !res.ok);
}
