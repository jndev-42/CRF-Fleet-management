/**
 * Migration production — module « Uniformes ».
 *
 * Crée les tables `UniformItem`, `UniformSize`, `UniformLoanBatch`, `UniformLoan`
 * et leurs index, ajoute la colonne `UniteLocale.uniformQrToken` avec son index
 * unique partiel, et insère la ligne `MenuSetting` `uniforms`.
 *
 * Le token « Uniformes » est DISTINCT de `UniteLocale.qrToken` (qui ouvre le
 * dépôt d'un compte rendu de mission) : le même QR ne doit jamais ouvrir les
 * deux fonctionnalités. D'où une colonne dédiée, et un index unique partiel
 * pour que deux UL ne puissent pas porter le même token.
 *
 * À exécuter AVANT le déploiement : sans les tables, chaque appel à
 * `/api/uniforms/*` et `/api/qr-uniforms/*` répond 500, et le bandeau des
 * emprunts en cours échoue sur toutes les pages.
 *
 * La ligne `MenuSetting` est indispensable pour pouvoir désactiver le menu :
 * `PATCH /api/settings/menus/uniforms` fait un UPDATE, sans ligne il ne ferait rien.
 *
 * Usage :
 *   npx tsx scripts/add-uniforms.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-uniforms.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

const TOKEN_INDEX = 'UniteLocale_uniformQrToken_key';

const TABLES: { name: string; ddl: string }[] = [
    {
        name: 'UniformItem',
        ddl: `CREATE TABLE IF NOT EXISTS "UniformItem" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "ulId"       TEXT NOT NULL REFERENCES "UniteLocale"("id") ON DELETE CASCADE,
            "name"       TEXT NOT NULL,
            "archivedAt" DATETIME,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    },
    {
        name: 'UniformSize',
        ddl: `CREATE TABLE IF NOT EXISTS "UniformSize" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "itemId"     TEXT NOT NULL REFERENCES "UniformItem"("id") ON DELETE CASCADE,
            "label"      TEXT NOT NULL,
            "quantity"   INTEGER NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
            "archivedAt" DATETIME,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    },
    {
        name: 'UniformLoanBatch',
        ddl: `CREATE TABLE IF NOT EXISTS "UniformLoanBatch" (
            "id"            TEXT NOT NULL PRIMARY KEY,
            "ulId"          TEXT NOT NULL,
            "borrowerId"    TEXT NOT NULL,
            "borrowerName"  TEXT,
            "borrowerEmail" TEXT,
            "source"        TEXT NOT NULL DEFAULT 'app' CHECK ("source" IN ('app', 'qr')),
            "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    },
    {
        name: 'UniformLoan',
        ddl: `CREATE TABLE IF NOT EXISTS "UniformLoan" (
            "id"            TEXT NOT NULL PRIMARY KEY,
            "batchId"       TEXT NOT NULL REFERENCES "UniformLoanBatch"("id") ON DELETE CASCADE,
            "sizeId"        TEXT NOT NULL REFERENCES "UniformSize"("id") ON DELETE CASCADE,
            "borrowerId"    TEXT NOT NULL,
            "borrowedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "returnedAt"    DATETIME,
            "returnedClean" INTEGER,
            "returnComment" TEXT,
            "washedAt"      DATETIME,
            "washedBy"      TEXT,
            "washedByName"  TEXT
        )`,
    },
];

const INDEXES: { table: string; name: string; ddl: string }[] = [
    { table: 'UniformItem', name: 'UniformItem_ulId_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformItem_ulId_idx" ON "UniformItem"("ulId")` },
    { table: 'UniformSize', name: 'UniformSize_itemId_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformSize_itemId_idx" ON "UniformSize"("itemId")` },
    { table: 'UniformLoanBatch', name: 'UniformLoanBatch_borrowerId_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformLoanBatch_borrowerId_idx" ON "UniformLoanBatch"("borrowerId")` },
    { table: 'UniformLoan', name: 'UniformLoan_sizeId_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformLoan_sizeId_idx" ON "UniformLoan"("sizeId")` },
    { table: 'UniformLoan', name: 'UniformLoan_batchId_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformLoan_batchId_idx" ON "UniformLoan"("batchId")` },
    { table: 'UniformLoan', name: 'UniformLoan_borrowerId_returnedAt_idx', ddl: `CREATE INDEX IF NOT EXISTS "UniformLoan_borrowerId_returnedAt_idx" ON "UniformLoan"("borrowerId", "returnedAt")` },
];

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : module Uniformes ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const tablesRes = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`);
    const existingTables = new Set(tablesRes.rows.map(r => String(r.name)));
    const indexesRes = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'index'`);
    const existingIndexes = new Set(indexesRes.rows.map(r => String(r.name)));

    const ulCols = await db.execute(`PRAGMA table_info("UniteLocale")`);
    const hasColumn = ulCols.rows.some(r => r.name === 'uniformQrToken');
    const hasTokenIndex = existingIndexes.has(TOKEN_INDEX);

    const menuRes = await db.execute({ sql: `SELECT menu_key FROM "MenuSetting" WHERE menu_key = ?`, args: ['uniforms'] });
    const hasMenu = menuRes.rows.length > 0;

    const missingTables = TABLES.filter(t => !existingTables.has(t.name));
    const missingIndexes = INDEXES.filter(i => !existingIndexes.has(i.name));

    for (const t of TABLES) console.log(`  table ${t.name} : ${existingTables.has(t.name) ? 'présente' : 'ABSENTE'}`);
    for (const i of INDEXES) console.log(`  index ${i.name} : ${existingIndexes.has(i.name) ? 'présent' : 'ABSENT'}`);
    console.log(`  colonne UniteLocale.uniformQrToken : ${hasColumn ? 'présente' : 'ABSENTE'}`);
    console.log(`  index ${TOKEN_INDEX} : ${hasTokenIndex ? 'présent' : 'ABSENT'}`);
    console.log(`  MenuSetting 'uniforms' : ${hasMenu ? 'présent' : 'ABSENT'}`);

    // Contrôle préalable : un doublon ferait échouer l'index unique, et l'erreur
    // brute d'SQLite ne dirait pas QUELLES UL sont en cause.
    if (hasColumn) {
        const dupes = await db.execute(`
            SELECT uniformQrToken, COUNT(*) AS c
              FROM "UniteLocale"
             WHERE uniformQrToken IS NOT NULL
             GROUP BY uniformQrToken
            HAVING c > 1
        `);
        if (dupes.rows.length > 0) {
            console.error("❌ Tokens dupliqués — index impossible. À trancher avant de rejouer :");
            for (const row of dupes.rows) {
                console.error(`   ${row.uniformQrToken} × ${row.c}`);
            }
            process.exit(1);
        }
    }

    if (missingTables.length === 0 && missingIndexes.length === 0 && hasColumn && hasTokenIndex && hasMenu) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const t of missingTables) console.log(`  ${t.ddl.replace(/\s+/g, ' ')}`);
        for (const i of missingIndexes) console.log(`  ${i.ddl}`);
        if (!hasColumn) console.log(`  ALTER TABLE "UniteLocale" ADD COLUMN "uniformQrToken" TEXT`);
        if (!hasTokenIndex) console.log(`  CREATE UNIQUE INDEX "${TOKEN_INDEX}" ON "UniteLocale"("uniformQrToken") WHERE "uniformQrToken" IS NOT NULL`);
        if (!hasMenu) console.log(`  INSERT INTO "MenuSetting" (menu_key, visibility) VALUES ('uniforms', 'available')`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    // L'ordre compte : une table avant les index qui la portent, et
    // `UniformItem` avant `UniformSize` avant `UniformLoan` (clés étrangères).
    for (const t of TABLES) {
        await db.execute(t.ddl);
    }
    for (const i of INDEXES) {
        await db.execute(i.ddl);
    }
    if (!hasColumn) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "uniformQrToken" TEXT`);
        console.log("✅ Colonne uniformQrToken ajoutée");
    }
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "${TOKEN_INDEX}" ON "UniteLocale"("uniformQrToken") WHERE "uniformQrToken" IS NOT NULL`);
    await db.execute({
        sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`,
        args: ['uniforms', 'available'],
    });

    // Vérification explicite plutôt que confiance dans l'absence d'exception.
    const afterTables = new Set((await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(r => String(r.name)));
    const afterIndexes = new Set((await db.execute(`SELECT name FROM sqlite_master WHERE type = 'index'`)).rows.map(r => String(r.name)));
    const afterCols = await db.execute(`PRAGMA table_info("UniteLocale")`);
    const afterMenu = await db.execute({ sql: `SELECT menu_key FROM "MenuSetting" WHERE menu_key = ?`, args: ['uniforms'] });

    const failures: string[] = [];
    for (const t of TABLES) if (!afterTables.has(t.name)) failures.push(`table ${t.name}`);
    for (const i of INDEXES) if (!afterIndexes.has(i.name)) failures.push(`index ${i.name}`);
    if (!afterIndexes.has(TOKEN_INDEX)) failures.push(`index ${TOKEN_INDEX}`);
    if (!afterCols.rows.some(r => r.name === 'uniformQrToken')) failures.push('colonne UniteLocale.uniformQrToken');
    if (afterMenu.rows.length === 0) failures.push(`MenuSetting 'uniforms'`);

    if (failures.length > 0) {
        console.error(`❌ Absents après migration : ${failures.join(', ')} — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Tables, index, colonne et menu confirmés");
    console.log("ℹ️ Les UL existantes restent sans token Uniformes : il est créé au premier appel à /api/uniforms/qr-token.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
