/**
 * Construction du catalogue des routes API pour le serveur MCP, à partir de `src/app/api`.
 *
 * Utilisé par `scripts/generate-mcp-catalog.ts` (qui écrit `catalog.generated.ts`) et par
 * le test de synchronisation. Jamais importé à l'exécution : le système de fichiers n'est
 * pas lisible sur Vercel, d'où le catalogue généré.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { HTTP_METHODS, isExcludedApiPath, type CatalogRoute, type HttpMethod } from './routes';

export const CATALOG_FILE = join('src', 'lib', 'mcp', 'catalog.generated.ts');

function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return routeFiles(full);
        return name === 'route.ts' ? [full] : [];
    });
}

/** Méthodes HTTP exportées par le source d'un `route.ts`. */
export function exportedMethods(source: string): HttpMethod[] {
    return HTTP_METHODS.filter(method =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)
        || new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`).test(source)
        || new RegExp(`export\\s*\\{[^}]*\\bas\\s+${method}\\b[^}]*\\}`).test(source)
        || new RegExp(`export\\s*\\{(?:[^}]*,)?\\s*${method}\\s*(?:,[^}]*)?\\}`).test(source),
    );
}

/** Chemin d'URL d'un fichier de route ; les groupes `(groupe)` ne comptent pas. */
function urlPath(apiDir: string, file: string): string {
    const segments = relative(apiDir, file).split(sep).slice(0, -1).filter(s => !/^\(.*\)$/.test(s));
    return ['/api', ...segments].join('/');
}

export function buildCatalog(rootDir: string = process.cwd()): CatalogRoute[] {
    const apiDir = join(rootDir, 'src', 'app', 'api');
    return routeFiles(apiDir)
        .map(file => ({ path: urlPath(apiDir, file), methods: exportedMethods(readFileSync(file, 'utf8')) }))
        .filter(route => route.methods.length > 0 && !isExcludedApiPath(route.path))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function renderCatalogSource(catalog: CatalogRoute[]): string {
    const lines = catalog.map(r => `    { path: ${JSON.stringify(r.path)}, methods: [${r.methods.map(m => `'${m}'`).join(', ')}] },`);
    return `/**
 * FICHIER GÉNÉRÉ — ne pas modifier à la main : \`npm run mcp:catalog\`.
 *
 * Routes de \`src/app/api\` et méthodes exportées, accessibles par l'outil \`api_request\`
 * du serveur MCP (exclusions de \`routes.ts\` appliquées). Un test vérifie qu'il reste
 * synchronisé avec le système de fichiers.
 */
import type { CatalogRoute } from './routes';

export const MCP_API_CATALOG: readonly CatalogRoute[] = [
${lines.join('\n')}
];
`;
}
