/**
 * Recopie complète d'une base libSQL dans une autre : schéma, lignes, index,
 * déclencheurs, vues, puis reconstruction de l'index FTS5 du référentiel.
 *
 * Utilisée par la recopie nocturne prod → démo (`/api/cron/daily-mileage-check`)
 * et par `scripts/dev-db-init.ts --prod-datas` (prod → conteneur local).
 *
 * Source : uniquement des `SELECT` paginés — jamais de transaction, de verrou ni
 * d'écriture. Cible : supprimée puis recréée à l'identique de la source, par lots
 * (`migrate` : `PRAGMA foreign_keys=off` quand le serveur l'honore), en suivant
 * l'ordre parents d'abord, que sqld impose même clés étrangères désactivées.
 * La recopie n'est pas atomique : un échec laisse la cible partielle, la
 * suivante la remet d'aplomb. La table `DemoMeta` de la cible le signale :
 * `state = 'refreshing'` pendant la copie, `'ready'` (+ `refreshedAt`) une fois
 * terminée — `/api/demo/status` ne propose la démo que sur `'ready'`.
 *
 * Secrets jamais recopiés (`DEMO_SCHEMA_ONLY_TABLES`) : schéma seul, sans lignes,
 * pour les identifiants constructeur, jetons MCP, sessions Renault et abonnements
 * push — et pour toute table qui les référence par clé étrangère (sans parent,
 * ses lignes violeraient la contrainte).
 */
import type { Client, InStatement } from '@libsql/client';
import {
    isFtsShadowTable,
    REFERENTIEL_FTS_DDL,
    REFERENTIEL_FTS_TABLE,
    REFERENTIEL_REBUILD_SQL,
} from '../referentiel/schema';

/** Tables dont on recopie le schéma mais aucune ligne (secrets, appareils réels). */
export const DEMO_SCHEMA_ONLY_TABLES: readonly string[] = [
    'BrandCredential',
    'RenaultSession',
    'McpToken',
    'PushSubscription',
];

/** Marqueur d'état de la cible, hors données recopiées. */
export const DEMO_META_TABLE = 'DemoMeta';
export type DemoState = 'refreshing' | 'ready';

const DEMO_META_DDL = `CREATE TABLE IF NOT EXISTS "${DEMO_META_TABLE}" (
    "id"          INTEGER PRIMARY KEY CHECK ("id" = 1),
    "state"       TEXT NOT NULL,
    "refreshedAt" TEXT
)`;

function demoStateStatement(state: DemoState, refreshedAt: string | null): InStatement {
    return {
        sql: `INSERT INTO "${DEMO_META_TABLE}" (id, state, refreshedAt) VALUES (1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET state = excluded.state, refreshedAt = COALESCE(excluded.refreshedAt, "${DEMO_META_TABLE}".refreshedAt)`,
        args: [state, refreshedAt],
    };
}

/** État de la base démo (`null` si jamais recopiée). Lève si la base est injoignable. */
export async function readDemoState(client: Client): Promise<{ state: DemoState; refreshedAt: string | null } | null> {
    const res = await client.execute(`SELECT state, refreshedAt FROM "${DEMO_META_TABLE}" WHERE id = 1`);
    const row = res.rows[0];
    if (!row) return null;
    return { state: row.state as DemoState, refreshedAt: (row.refreshedAt as string | null) ?? null };
}

export interface CloneOptions {
    /** Lignes lues par requête sur la source (défaut 50). */
    pageSize?: number;
    /** Tables recopiées sans leurs lignes (défaut `DEMO_SCHEMA_ONLY_TABLES`). */
    schemaOnlyTables?: readonly string[];
    /** Journal de progression (défaut : aucun). */
    log?: (message: string) => void;
}

export interface CloneSummary {
    tables: number;
    rows: number;
    durationMs: number;
}

interface SchemaObject {
    type: 'table' | 'index' | 'trigger' | 'view';
    name: string;
    tblName: string;
    sql: string | null;
}

const DEFAULT_PAGE_SIZE = 50;

/** Tables internes (SQLite, libSQL, Litestream) : jamais recopiées. */
function isInternalTable(name: string): boolean {
    return name.startsWith('sqlite_') || name.startsWith('libsql_') || name.startsWith('_litestream');
}

export function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

async function readSchema(client: Client): Promise<SchemaObject[]> {
    const res = await client.execute(
        `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger', 'view') ORDER BY name`,
    );
    return res.rows
        .map((r) => ({
            type: r.type as SchemaObject['type'],
            name: r.name as string,
            tblName: r.tbl_name as string,
            sql: (r.sql as string | null) ?? null,
        }))
        .filter((o) => !isInternalTable(o.name) && !isInternalTable(o.tblName))
        .filter((o) => o.name !== DEMO_META_TABLE && o.tblName !== DEMO_META_TABLE)
        // L'index FTS5 et ses tables fantômes ne se recopient pas ligne à ligne :
        // l'index est recréé puis reconstruit à partir des pages recopiées.
        .filter((o) => !isFtsShadowTable(o.name) && !isFtsShadowTable(o.tblName));
}

/** Tables visées par les clauses `REFERENCES` d'un `CREATE TABLE`. */
function foreignKeyTargets(sql: string | null): string[] {
    const targets: string[] = [];
    for (const m of (sql ?? '').matchAll(/REFERENCES\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z0-9_]+))/gi)) {
        const dep = m[1] ?? m[2] ?? m[3] ?? m[4];
        if (dep) targets.push(dep);
    }
    return targets;
}

/** Ordre parents d'abord, d'après les clauses `REFERENCES` (les cycles sont rompus). */
export function dependencyOrder(tables: { name: string; sql: string | null }[]): string[] {
    const names = new Set(tables.map((t) => t.name));
    const dependsOn = new Map<string, Set<string>>();
    for (const { name, sql } of tables) {
        dependsOn.set(name, new Set(foreignKeyTargets(sql).filter((dep) => dep !== name && names.has(dep))));
    }
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (name: string): void => {
        if (visited.has(name) || visiting.has(name)) return;
        visiting.add(name);
        for (const dep of dependsOn.get(name) ?? []) visit(dep);
        visiting.delete(name);
        visited.add(name);
        order.push(name);
    };
    for (const { name } of tables) visit(name);
    return order;
}

/** `seeds` plus toute table qui en dépend (directement ou non) par clé étrangère. */
export function withDependents(tables: { name: string; sql: string | null }[], seeds: readonly string[]): Set<string> {
    const result = new Set(seeds);
    let grew = true;
    while (grew) {
        grew = false;
        for (const { name, sql } of tables) {
            if (!result.has(name) && foreignKeyTargets(sql).some((dep) => dep !== name && result.has(dep))) {
                result.add(name);
                grew = true;
            }
        }
    }
    return result;
}

/** Remplace toute la cible par une copie de la source. Ne lit la source qu'en `SELECT`. */
export async function cloneDatabase(source: Client, target: Client, options: CloneOptions = {}): Promise<CloneSummary> {
    const started = Date.now();
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const log = options.log ?? (() => {});

    const sourceSchema = await readSchema(source);
    const sourceTables = sourceSchema.filter((o) => o.type === 'table' && o.sql);
    const insertOrder = dependencyOrder(sourceTables);
    const tableSql = new Map(sourceTables.map((t) => [t.name, t.sql as string]));
    const schemaOnly = withDependents(sourceTables, options.schemaOnlyTables ?? DEMO_SCHEMA_ONLY_TABLES);

    // 0. Marquer la cible « en cours de recopie » avant d'y toucher.
    await target.migrate([DEMO_META_DDL, demoStateStatement('refreshing', null)]);

    // 1. Vider la cible : vues, index FTS, puis tables enfants avant parents
    //    (sqld contrôle les clés étrangères jusque dans DROP TABLE).
    const targetSchema = await readSchema(target);
    const targetTables = targetSchema.filter((o) => o.type === 'table');
    const drops: InStatement[] = [
        ...targetSchema.filter((o) => o.type === 'view').map((v) => `DROP VIEW IF EXISTS ${quoteIdent(v.name)}`),
        `DROP TABLE IF EXISTS ${quoteIdent(REFERENTIEL_FTS_TABLE)}`,
        ...dependencyOrder(targetTables).reverse().map((t) => `DROP TABLE IF EXISTS ${quoteIdent(t)}`),
    ];
    // 2. Recréer les tables de la source, parents d'abord.
    const creates: InStatement[] = insertOrder.map((t) => tableSql.get(t) as string);
    await target.migrate([...drops, ...creates]);

    // 3. Recopier les lignes, page par page, parents d'abord.
    let totalRows = 0;
    for (const table of insertOrder) {
        if (schemaOnly.has(table)) {
            log(`${table} : schéma seul (lignes non recopiées)`);
            continue;
        }
        const orderBy = /\bWITHOUT\s+ROWID\b/i.test(tableSql.get(table) ?? '') ? '1' : 'rowid';
        let insertSql: string | undefined;
        let tableRows = 0;
        for (let offset = 0; ; offset += pageSize) {
            const page = await source.execute({
                sql: `SELECT * FROM ${quoteIdent(table)} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
                args: [pageSize, offset],
            });
            if (page.rows.length === 0) break;
            insertSql ??= `INSERT OR REPLACE INTO ${quoteIdent(table)} (${page.columns.map(quoteIdent).join(', ')}) VALUES (${page.columns.map(() => '?').join(', ')})`;
            const sql = insertSql;
            await target.migrate(page.rows.map((row) => ({ sql, args: page.columns.map((c) => row[c] ?? null) })));
            tableRows += page.rows.length;
            if (page.rows.length < pageSize) break;
        }
        totalRows += tableRows;
        log(`${table} : ${tableRows} ligne(s)`);
    }

    // 4. Index, vues et déclencheurs (après les données : aucun déclencheur ne rejoue la copie),
    //    puis index FTS5 du référentiel reconstruit depuis les pages recopiées.
    const extras: InStatement[] = [
        ...sourceSchema.filter((o) => o.type === 'index' && o.sql).map((o) => o.sql as string),
        ...sourceSchema.filter((o) => o.type === 'view' && o.sql).map((o) => o.sql as string),
        ...sourceSchema.filter((o) => o.type === 'trigger' && o.sql).map((o) => o.sql as string),
    ];
    if (tableSql.has('ReferentielPage')) extras.push(REFERENTIEL_FTS_DDL, REFERENTIEL_REBUILD_SQL);
    if (extras.length > 0) await target.migrate(extras);
    if (tableSql.has('ReferentielPage')) log(`${REFERENTIEL_FTS_TABLE} : index reconstruit`);

    // 5. Recopie terminée : la base démo est utilisable.
    await target.migrate([demoStateStatement('ready', new Date().toISOString())]);

    return { tables: insertOrder.length, rows: totalRows, durationMs: Date.now() - started };
}
