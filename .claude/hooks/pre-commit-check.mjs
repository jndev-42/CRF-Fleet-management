#!/usr/bin/env node
/**
 * Hook Claude Code (PreToolUse / Bash) — bloque les `git commit` lancés par
 * Claude si le lint ou les tests ne sont pas 100% passants, si aucun fichier
 * de test n'a été ajouté/modifié pour du code source ajouté/modifié, ou si
 * la couverture des lignes ajoutées est sous 80%.
 *
 * Ne s'applique qu'aux commits exécutés par Claude via l'outil Bash — un
 * `git commit` tapé directement dans un terminal humain n'est pas intercepté
 * ici (seul le hook Husky natif s'applique dans ce cas).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const COVERAGE_THRESHOLD = 80;

function readStdin() {
    try {
        return readFileSync(0, 'utf-8');
    } catch {
        return '';
    }
}

function allow() {
    process.exit(0);
}

function deny(reason) {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    }));
    process.exit(0);
}

function isSourceFile(path) {
    return path.startsWith('src/')
        && (path.endsWith('.ts') || path.endsWith('.tsx'))
        && !path.includes('/__tests__/')
        && !path.endsWith('.d.ts');
}

function isTestFile(path) {
    return path.startsWith('src/__tests__/')
        && (path.endsWith('.test.ts') || path.endsWith('.test.tsx'));
}

function run(cmd, args, cwd) {
    try {
        const output = execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, output };
    } catch (e) {
        const err = /** @type {{ stdout?: string; stderr?: string; message: string }} */ (e);
        return { ok: false, output: `${err.stdout || ''}\n${err.stderr || ''}\n${err.message || ''}`.trim() };
    }
}

function getStagedFiles(cwd) {
    const res = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], cwd);
    if (!res.ok) return [];
    return res.output.split('\n').map(l => l.trim()).filter(Boolean);
}

/** Numéros de lignes ajoutées (côté "après") pour un fichier, via les en-têtes de hunk du diff staged. */
function getAddedLines(cwd, file) {
    const res = run('git', ['diff', '--cached', '--unified=0', '--', file], cwd);
    if (!res.ok) return [];
    const added = [];
    let currentLine = null;
    for (const line of res.output.split('\n')) {
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
            currentLine = parseInt(hunkMatch[1], 10);
            continue;
        }
        if (currentLine === null) continue;
        if (line.startsWith('+') && !line.startsWith('+++')) {
            added.push(currentLine);
            currentLine++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            // ligne supprimée : ne consomme pas de numéro côté "après"
        } else if (line.startsWith(' ')) {
            currentLine++;
        }
    }
    return added;
}

/**
 * Carte ligne -> couverte (true/false) à partir d'une entrée coverage-final.json (format Istanbul).
 *
 * Les statements les plus étroits (span le plus court) l'emportent sur les
 * statements englobants : le statement d'un bloc `if` entier couvre par ex.
 * les lignes 2 à 7 et compte comme "exécuté" dès que la condition est
 * évaluée, même si le corps (statements internes, plus précis) n'a jamais
 * tourné — sans cette priorité, une branche jamais exercée apparaîtrait
 * couverte simplement parce que le bloc qui la contient l'est.
 */
function buildLineCoverageMap(fileCoverage) {
    const map = new Map();
    const statementMap = fileCoverage.statementMap || {};
    const hits = fileCoverage.s || {};
    const statements = Object.entries(statementMap)
        .map(([id, loc]) => ({
            startLine: loc.start.line,
            endLine: loc.end.line,
            span: loc.end.line - loc.start.line,
            covered: (hits[id] || 0) > 0,
        }))
        .sort((a, b) => a.span - b.span);

    for (const stmt of statements) {
        for (let l = stmt.startLine; l <= stmt.endLine; l++) {
            if (!map.has(l)) map.set(l, stmt.covered);
        }
    }
    return map;
}

/**
 * Vrai seulement si `git commit` est réellement invoqué comme commande
 * (au début de la chaîne ou après un séparateur shell `&&`/`||`/`;`/`|`/newline),
 * pas seulement présent comme sous-chaîne (ex. à l'intérieur d'un argument
 * entre guillemets d'une commande `echo`).
 */
function isGitCommitInvocation(command) {
    const segments = command.split(/&&|\|\||;|\||\n/);
    return segments.some(seg => {
        const trimmed = seg.trim();
        if (!/^git\s+(?:-\S+(?:\s+\S+)?\s+)*commit\b/.test(trimmed)) return false;
        return !/--help\b/.test(trimmed) && !/\s-h\b/.test(trimmed);
    });
}

function main() {
    const raw = readStdin();
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return allow();
    }

    if (payload.tool_name !== 'Bash') return allow();
    const command = payload.tool_input?.command || '';
    if (!isGitCommitInvocation(command)) return allow();

    const cwd = payload.cwd || process.cwd();

    // 1. Fichiers de test présents pour le code source modifié ?
    const staged = getStagedFiles(cwd);
    const sourceFiles = staged.filter(isSourceFile);
    const testFiles = staged.filter(isTestFile);

    if (sourceFiles.length > 0 && testFiles.length === 0) {
        return deny(
            `Commit bloqué : ${sourceFiles.length} fichier(s) source modifié(s) (${sourceFiles.slice(0, 5).join(', ')}${sourceFiles.length > 5 ? '…' : ''}) sans aucun fichier de test ajouté/modifié dans le même commit. Écris les tests correspondants avant de committer.`
        );
    }

    // 2. Lint 100% (0 erreur, 0 warning)
    const lint = run('npx', ['eslint', '--max-warnings=0'], cwd);
    if (!lint.ok) {
        return deny(`Commit bloqué : npm run lint échoue.\n\n${lint.output.slice(0, 3000)}`);
    }

    if (sourceFiles.length === 0) {
        // Rien à tester (doc/config/changelog uniquement) : pas besoin de lancer la suite complète.
        return allow();
    }

    // 3. Tests + couverture en une seule exécution
    const coverageDir = join(cwd, 'coverage');
    const test = run('npx', ['vitest', 'run', '--coverage', '--coverage.reporter=json'], cwd);
    if (!test.ok) {
        return deny(`Commit bloqué : npm run test échoue (suite non 100% verte).\n\n${test.output.slice(0, 3000)}`);
    }

    // 4. Couverture des lignes ajoutées >= 80% pour chaque fichier source modifié
    const coverageFinalPath = join(coverageDir, 'coverage-final.json');
    if (!existsSync(coverageFinalPath)) {
        return deny('Commit bloqué : le rapport de couverture (coverage/coverage-final.json) est introuvable après vitest run --coverage — impossible de vérifier la couverture des lignes ajoutées.');
    }

    let coverageData;
    try {
        coverageData = JSON.parse(readFileSync(coverageFinalPath, 'utf-8'));
    } catch {
        return deny('Commit bloqué : le rapport de couverture est illisible (JSON invalide).');
    }

    const failures = [];
    for (const relPath of sourceFiles) {
        const addedLines = getAddedLines(cwd, relPath);
        if (addedLines.length === 0) continue; // fichier renommé/déplacé sans changement de contenu

        const absPath = join(cwd, relPath);
        const fileCoverage = coverageData[absPath];
        const lineMap = fileCoverage ? buildLineCoverageMap(fileCoverage) : new Map();

        const coverableAdded = addedLines.filter(l => lineMap.has(l));
        if (coverableAdded.length === 0) continue; // que des lignes non instrumentables (types, commentaires, blancs)

        const uncovered = coverableAdded.filter(l => !lineMap.get(l));
        const pct = ((coverableAdded.length - uncovered.length) / coverableAdded.length) * 100;

        if (pct < COVERAGE_THRESHOLD) {
            failures.push(`${relPath} : ${pct.toFixed(0)}% des lignes ajoutées couvertes (seuil ${COVERAGE_THRESHOLD}%) — lignes non couvertes : ${uncovered.slice(0, 20).join(', ')}${uncovered.length > 20 ? '…' : ''}`);
        }
    }

    if (failures.length > 0) {
        return deny(`Commit bloqué : couverture de tests insuffisante sur le code ajouté (seuil ${COVERAGE_THRESHOLD}%).\n\n${failures.join('\n')}`);
    }

    return allow();
}

main();
