/**
 * Câblage de `scripts/migrate-drive-images-to-r2.ts`, sorti du script pour être
 * testé : lecture des lignes en base (SQL, repli d'UL des missions via `UserUL`),
 * assemblage des dépendances, déroulé de la migration, bilan et code de sortie.
 * La base, Drive et R2 sont INJECTÉS (le script passe les vrais, les tests une base
 * SQLite en mémoire et des faux).
 */

import { expenseUlSegment } from '@/lib/r2';
import { toMediaUlSegment } from '@/lib/media/refs';
import {
    MIGRATION_KINDS,
    groupMigrationRows,
    journalEntries,
    migrateGroup,
    type DriveMigrationDeps,
    type DriveSource,
    type MediaSink,
    type MigrationJournalEntry,
    type MigrationRow,
} from '@/lib/media/drive-migration';

/** Sous-ensemble du client libSQL utilisé (le vrai `db` comme un client `file::memory:`). */
export interface MigrationDb {
    execute(stmt: string | { sql: string; args: string[] }): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
}

export interface MigrationLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** Clause SQL « référence Drive » : non vide et sans `/`. */
const IS_DRIVE = (col: string) => `${col} IS NOT NULL AND ${col} != '' AND instr(${col}, '/') = 0`;

/** Segment UL d'une ligne ; `null` sans UL (ligne signalée et sautée, jamais rangée sous une UL inventée). */
export function migrationUlSegment(slug: unknown, ulId: unknown): string | null {
    return ulId && ulId !== 'default' ? toMediaUlSegment(expenseUlSegment(slug, String(ulId))) : null;
}

/**
 * Lignes portant encore un id Drive. UL : celle du véhicule (trajet, incident) ;
 * pour une mission, l'UL du compte rendu, à défaut (rapport DT : `NULL`, `''` ou
 * `'default'`) l'UL de rattachement de son auteur (`UserUL`, `is_home` d'abord).
 */
export async function readMigrationRows(db: MigrationDb): Promise<MigrationRow[]> {
    const rows: MigrationRow[] = [];
    const push = (kind: MigrationRow['kind'], r: Record<string, unknown>) => rows.push({
        kind, rowId: String(r.id), driveId: String(r.ref), ulSegment: migrationUlSegment(r.slug, r.ulId), name: String(r.name ?? ''),
    });

    const trips = await db.execute(`
        SELECT t.id, t.driveFolderId AS ref, v.name AS name, v.ulId AS ulId, ul.slug AS slug
        FROM Trip t LEFT JOIN Vehicle v ON v.id = t.vehicleId
        LEFT JOIN "UniteLocale" ul ON ul.id = v.ulId
        WHERE ${IS_DRIVE('t.driveFolderId')}`);
    for (const r of trips.rows) push('trip', r);

    const incidents = await db.execute(`
        SELECT ir.id, ir.driveFolderId AS ref, v.name AS name, v.ulId AS ulId, ul.slug AS slug
        FROM "IncidentReport" ir LEFT JOIN Vehicle v ON v.id = ir.vehicleId
        LEFT JOIN "UniteLocale" ul ON ul.id = v.ulId
        WHERE ${IS_DRIVE('ir.driveFolderId')}`);
    for (const r of incidents.rows) push('incident', r);

    const missionSql = (col: string) => `
        SELECT mr.id, mr.${col} AS ref, mr.mission_name AS name, eff.ulId AS ulId, ul.slug AS slug
        FROM "mission_reports" mr
        LEFT JOIN (
            SELECT m.id AS reportId,
                   COALESCE(NULLIF(NULLIF(m.ulId, ''), 'default'),
                            (SELECT uu.ulId FROM "UserUL" uu WHERE uu.userId = m.submitted_by ORDER BY uu.is_home DESC, uu.ulId LIMIT 1)) AS ulId
            FROM "mission_reports" m
        ) eff ON eff.reportId = mr.id
        LEFT JOIN "UniteLocale" ul ON ul.id = eff.ulId
        WHERE ${IS_DRIVE(`mr.${col}`)}`;
    for (const [kind, col] of [['mission-com', 'drive_folder_id'], ['mission-report', 'signed_report_drive_id']] as const) {
        const res = await db.execute(missionSql(col));
        for (const r of res.rows) push(kind, r);
    }
    return rows;
}

/** Dépendances de `migrateGroup` à partir d'une base, d'une source Drive et d'un stockage R2. */
export function createMigrationDeps(db: MigrationDb, drive: DriveSource, r2: MediaSink): DriveMigrationDeps {
    return {
        drive,
        r2,
        execute: async (stmt) => {
            const res = await db.execute(stmt);
            return { rowsAffected: res.rowsAffected };
        },
    };
}

export interface MigrationStats {
    migrated: number;
    planned: number;
    ignored: number;
    skipped: number;
    failed: number;
    trashed: number;
    kept: number;
}

export interface MigrationRun {
    rowCount: number;
    groupCount: number;
    stats: MigrationStats;
    failures: string[];
    journal: MigrationJournalEntry[];
    exitCode: MigrationExitCode;
}

/** 0 : tout est migré ou ignoré ; 1 : au moins un échec ; 2 : aucun échec mais des lignes sautées (ids Drive restants). */
export type MigrationExitCode = 0 | 1 | 2;

/** Code de sortie : 1 si au moins une référence a échoué, sinon 2 si au moins une a été sautée, sinon 0. */
export function exitCodeOf(stats: Pick<MigrationStats, 'failed' | 'skipped'>): MigrationExitCode {
    if (stats.failed > 0) return 1;
    return stats.skipped > 0 ? 2 : 0;
}

/** Lit les lignes, migre chaque groupe, journalise le bilan ; n'écrit rien sans `apply`. */
export async function runDriveMigration(opts: {
    db: MigrationDb;
    drive: DriveSource;
    r2: MediaSink;
    apply: boolean;
    deleteOld: boolean;
    log: MigrationLogger;
    /** Appelé pour chaque ligne repointée, AU FIL de l'exécution (journal persistant). */
    onJournal?: (entry: MigrationJournalEntry) => void;
}): Promise<MigrationRun> {
    const { apply, deleteOld, log } = opts;
    const rows = await readMigrationRows(opts.db);
    const groups = groupMigrationRows(rows);
    const stats: MigrationStats = { migrated: 0, planned: 0, ignored: 0, skipped: 0, failed: 0, trashed: 0, kept: 0 };
    const failures: string[] = [];
    const journal: MigrationJournalEntry[] = [];
    log.info(`${rows.length} ligne(s), ${groups.length} référence(s) Drive à migrer.\n`);
    if (groups.length === 0) {
        log.info('Rien à migrer.');
        return { rowCount: rows.length, groupCount: 0, stats, failures, journal, exitCode: 0 };
    }

    const deps = createMigrationDeps(opts.db, opts.drive, opts.r2);
    for (const group of groups) {
        const result = await migrateGroup(group, deps, { apply, deleteOld });
        const label = `${group.targets.map((t) => `${MIGRATION_KINDS[t.kind].label} ${t.rowIds.join(', ')}`).join(' + ')} (Drive ${group.driveId})`;
        switch (result.status) {
            case 'migrated':
            case 'planned':
                stats[result.status]++;
                if (result.trashed) stats.trashed++;
                if (deleteOld && !result.trashed) stats.kept++;
                log.info(`  ${apply ? '✓' : '→'} ${label}${result.trashed ? ' · Drive à la corbeille' : ''}`);
                for (const t of result.targets) {
                    log.info(`      ${t.table}.${t.column} → ${t.newRef} · ${t.files.length} fichier(s)${apply && !t.updated ? ' (non repointé : modifié entre-temps)' : ''}`);
                    for (const f of t.files) log.info(`        ${f.name} → ${f.key}`);
                }
                for (const f of result.ignoredFiles) log.info(`      (non repris) ${f}`);
                if (result.reason) log.warn(`      ! ${result.reason}`);
                for (const entry of journalEntries(result)) {
                    journal.push(entry);
                    opts.onJournal?.(entry);
                }
                break;
            case 'ignored':
                stats.ignored++;
                log.info(`  - ${label} : ${result.reason}`);
                break;
            case 'skipped':
                stats.skipped++;
                log.warn(`  ! ${label} sautée : ${result.reason}`);
                break;
            case 'error':
                stats.failed++;
                failures.push(`${label} : ${result.reason}`);
                log.error(`  ✗ ${label} : ${result.reason}`);
                break;
        }
    }

    log.info(`\n${apply ? `Migrées ${stats.migrated}` : `À migrer ${stats.planned}`} · ignorées (mock) ${stats.ignored} · sautées ${stats.skipped} · échecs ${stats.failed}${deleteOld ? ` · à la corbeille ${stats.trashed} · dossiers Drive conservés ${stats.kept}` : ''}`);
    if (failures.length) {
        log.error('\nÉchecs (références laissées sur Drive) :');
        for (const f of failures) log.error(`  - ${f}`);
    }
    return { rowCount: rows.length, groupCount: groups.length, stats, failures, journal, exitCode: exitCodeOf(stats) };
}
