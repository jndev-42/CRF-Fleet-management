/**
 * Exhaustivité du journal d'audit : chaque export mutant (POST/PUT/PATCH/DELETE)
 * d'une route API doit être enveloppé par `withAudit`.
 *
 * Contrôle statique sur le source (importer les ~75 routes chargerait R2, Renault,
 * le scellement PDF…) : une route ajoutée avec `export async function POST` — ou
 * un `export const POST = handler` non enveloppé — fait échouer la suite.
 *
 * Seules exemptions : `auth/[...nextauth]` (la connexion est tracée par
 * `events.signIn` de `src/auth.ts`) et `cron/*` (appels machine, sans utilisateur).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const API_DIR = join(process.cwd(), 'src', 'app', 'api');
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const EXEMPT = [/^auth\/\[\.\.\.nextauth\]\//, /^cron\//];

function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return routeFiles(full);
        return name === 'route.ts' ? [full] : [];
    });
}

const routes = routeFiles(API_DIR)
    .map(file => ({ file, rel: relative(API_DIR, file).split(sep).join('/') }))
    .filter(({ rel }) => !EXEMPT.some(re => re.test(rel)));

/** Violations d'un fichier source : exports mutants non enveloppés. */
function unauditedExports(source: string): string[] {
    const problems: string[] = [];
    for (const method of MUTATING) {
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)) {
            problems.push(`${method} : fonction exportée directement`);
        }
        if (new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(source)) {
            problems.push(`${method} : ré-export non enveloppé`);
        }
        const constExport = source.match(new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\b[^=]*=\\s*([^;]*)`));
        if (constExport && !/^withAudit\(/.test(constExport[1].trim())) {
            problems.push(`${method} : export sans withAudit`);
        }
        if (constExport && !/action:\s*["'`][^"'`]+["'`]/.test(constExport[1])) {
            problems.push(`${method} : libellé d'action manquant`);
        }
    }
    return problems;
}

describe("journal d'audit — couverture des routes mutantes", () => {
    it('trouve les routes mutantes (garde-fou contre un chemin cassé)', () => {
        const audited = routes.filter(({ file }) => readFileSync(file, 'utf8').includes('withAudit('));
        expect(audited.length).toBeGreaterThanOrEqual(74);
    });

    it.each(routes.map(r => [r.rel, r.file]))('%s : chaque export mutant passe par withAudit', (_rel, file) => {
        expect(unauditedExports(readFileSync(file, 'utf8'))).toEqual([]);
    });

    it('le détecteur signale une route mutante non enveloppée', () => {
        expect(unauditedExports('export async function POST(request: Request) {}')).toHaveLength(1);
        expect(unauditedExports('export const DELETE = handler;')).toContain('DELETE : export sans withAudit');
        expect(unauditedExports('export const POST: RouteHandler = handler;')).toContain('POST : export sans withAudit');
        expect(unauditedExports('export let PATCH = handler;')).toContain('PATCH : export sans withAudit');
        expect(unauditedExports('export { handler as PATCH };')).toHaveLength(1);
        expect(unauditedExports("export const PUT = withAudit(h, { action: \"Modification\", entityType: 'x' });")).toEqual([]);
        expect(unauditedExports('export async function GET() {}')).toEqual([]);
    });
});
