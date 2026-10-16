import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_KEYS } from '@/lib/themes/catalog';

/** Dossier d'illustrations sous `public/seasons/` de chaque thème du catalogue. */
const ASSET_DIRS: Record<string, string> = {
    'vendanges-montmartre': 'vendanges',
    halloween: 'halloween',
};

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

function loadCss(key: string): string {
    const file = join(process.cwd(), `src/styles/seasons/${key}.css`);
    if (!existsSync(file)) return '';
    return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('catalogue et feuilles de style', () => {
    it.each(THEME_KEYS)('le thème %s a sa feuille src/styles/seasons/<clé>.css', key => {
        expect(existsSync(join(process.cwd(), `src/styles/seasons/${key}.css`))).toBe(true);
    });

    it.each(THEME_KEYS)('layout.tsx importe la feuille du thème %s', key => {
        const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
        expect(layout).toContain(`import "@/styles/seasons/${key}.css";`);
    });

    it.each(THEME_KEYS)('le thème %s a son dossier d\'illustrations déclaré', key => {
        expect(ASSET_DIRS[key]).toBeTruthy();
        expect(existsSync(join(process.cwd(), 'public/seasons', ASSET_DIRS[key]))).toBe(true);
    });
});

describe.each(THEME_KEYS)('feuille du thème %s', key => {
    const PREFIX = `html[data-season="${key}"]`;
    const css = loadCss(key);
    const rules = parseRules(css);
    const styleRules = rules.filter(r => !r.keyframes);

    it('contient des règles', () => {
        expect(styleRules.length).toBeGreaterThan(10);
    });

    it('préfixe chaque sélecteur par le sélecteur du thème', () => {
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

    it('référence uniquement des illustrations de son dossier, qui existent sous public/', () => {
        const dir = ASSET_DIRS[key];
        const all = [...css.matchAll(/url\(["']?(\/seasons\/[^"')]+)["']?\)/g)].map(m => m[1]);
        expect(all.length).toBeGreaterThan(0);
        expect(all.filter(u => !u.startsWith(`/seasons/${dir}/`))).toEqual([]);
        const missing = all.filter(u => !existsSync(join(process.cwd(), 'public', u)));
        expect(missing).toEqual([]);
    });
});
