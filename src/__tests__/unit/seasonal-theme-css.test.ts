import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'html[data-season="vendanges-montmartre"]';

const css = readFileSync(
    join(process.cwd(), 'src/styles/seasons/vendanges-montmartre.css'),
    'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule { selectors: string[]; body: string; keyframes: boolean }

/** Aplati les blocs : les `@media` sont parcourus, les `@keyframes` ignorés. */
function parseRules(source: string): Rule[] {
    const rules: Rule[] = [];
    let i = 0;
    while (i < source.length) {
        const open = source.indexOf('{', i);
        if (open === -1) break;
        const header = source.slice(i, open).trim();
        let depth = 1;
        let j = open + 1;
        while (j < source.length && depth > 0) {
            if (source[j] === '{') depth++;
            else if (source[j] === '}') depth--;
            j++;
        }
        const inner = source.slice(open + 1, j - 1);
        if (header.startsWith('@keyframes')) {
            rules.push({ selectors: [header], body: inner, keyframes: true });
        } else if (header.startsWith('@media')) {
            rules.push(...parseRules(inner));
        } else {
            rules.push({
                selectors: header.split(',').map(s => s.trim()).filter(Boolean),
                body: inner,
                keyframes: false,
            });
        }
        i = j;
    }
    return rules;
}

const rules = parseRules(css);
const styleRules = rules.filter(r => !r.keyframes);

describe('feuille du thème vendanges-montmartre', () => {
    it('contient des règles', () => {
        expect(styleRules.length).toBeGreaterThan(10);
    });

    it('préfixe chaque sélecteur par html[data-season="vendanges-montmartre"]', () => {
        const offenders = styleRules.flatMap(r => r.selectors).filter(s => !s.startsWith(PREFIX));
        expect(offenders).toEqual([]);
    });

    it('ne cible jamais .btn-danger', () => {
        const hits = styleRules.flatMap(r => r.selectors).filter(s => s.includes('btn-danger'));
        expect(hits).toEqual([]);
    });

    it('ne cible jamais .nav-logout-btn (le bouton de déconnexion garde son style danger d\'origine)', () => {
        const hits = styleRules.flatMap(r => r.selectors).filter(s => s.includes('nav-logout-btn'));
        expect(hits).toEqual([]);
    });

    it('ne redéfinit pas --crf-red*', () => {
        const hits = styleRules.filter(r => /(^|[;\s])--crf-red[\w-]*\s*:/.test(r.body));
        expect(hits).toEqual([]);
    });

    it('coupe les animations sous prefers-reduced-motion', () => {
        const animated = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}\n/g, '');
        expect(animated).not.toMatch(/animation\s*:/);
    });

    it('référence uniquement des illustrations qui existent sous public/', () => {
        const urls = [...css.matchAll(/url\(["']?(\/seasons\/vendanges\/[^"')]+)["']?\)/g)].map(m => m[1]);
        expect(urls.length).toBeGreaterThan(0);
        const missing = urls.filter(u => !existsSync(join(process.cwd(), 'public', u)));
        expect(missing).toEqual([]);
    });
});
