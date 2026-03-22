/**
 * Migration de production — Création des tables d'inventaire médical.
 *
 * Ce script :
 *   1. Crée les 8 tables de l'inventaire (InvItem, InvLocation, InvStock,
 *      InvTemplate, InvGroupe, InvGroupeMember, InvTransfer, InvBagTemplate,
 *      InvBagTemplateItem) ainsi que l'index singleton.
 *   2. Ajoute la colonne `templateId` sur InvLocation si absente (migration idempotente).
 *   3. Insère les 2 emplacements singleton obligatoires (Stock Central, Pharmacie Tampon).
 *
 * À exécuter une seule fois sur la base de production Turso après déploiement.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-inventory.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    // ── Tables ────────────────────────────────────────────────────

    console.log('\n▶ Création des tables d\'inventaire...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvItem" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "sku"       TEXT UNIQUE,
            "category"  TEXT,
            "unit"      TEXT NOT NULL DEFAULT 'unité',
            "notes"     TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ InvItem');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBagTemplate" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL UNIQUE,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ InvBagTemplate');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvLocation" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "type"      TEXT NOT NULL CHECK (type IN ('STOCK_CENTRAL', 'PHARMA_TAMPON', 'VEHICLE', 'SAC')),
            "name"      TEXT NOT NULL,
            "vehicleId" TEXT REFERENCES "Vehicle"("id") ON DELETE CASCADE,
            "parentId"  TEXT REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "isSealed"  INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ InvLocation');

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "InvLocation_singleton"
        ON "InvLocation"("type") WHERE type IN ('STOCK_CENTRAL', 'PHARMA_TAMPON')
    `);
    console.log('  ✓ Index InvLocation_singleton');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStock" (
            "id"                TEXT NOT NULL PRIMARY KEY,
            "locationId"        TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "itemId"            TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE RESTRICT,
            "quantity"          INTEGER NOT NULL DEFAULT 0,
            "expiryDate"        TEXT,
            "status"            TEXT NOT NULL DEFAULT 'OK',
            "criticalThreshold" INTEGER,
            "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("locationId", "itemId")
        )
    `);
    console.log('  ✓ InvStock');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvTemplate" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "locationId" TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "targetQty"  INTEGER NOT NULL DEFAULT 1,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("locationId", "itemId")
        )
    `);
    console.log('  ✓ InvTemplate');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBagTemplateItem" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "templateId" TEXT NOT NULL REFERENCES "InvBagTemplate"("id") ON DELETE CASCADE,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "targetQty"  INTEGER NOT NULL DEFAULT 1,
            UNIQUE ("templateId", "itemId")
        )
    `);
    console.log('  ✓ InvBagTemplateItem');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvGroupe" (
            "id"          TEXT NOT NULL PRIMARY KEY,
            "name"        TEXT NOT NULL,
            "description" TEXT,
            "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ InvGroupe');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvGroupeMember" (
            "groupeId"   TEXT NOT NULL REFERENCES "InvGroupe"("id") ON DELETE CASCADE,
            "locationId" TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            PRIMARY KEY ("groupeId", "locationId")
        )
    `);
    console.log('  ✓ InvGroupeMember');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvTransfer" (
            "id"             TEXT NOT NULL PRIMARY KEY,
            "itemId"         TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE RESTRICT,
            "fromLocationId" TEXT REFERENCES "InvLocation"("id") ON DELETE SET NULL,
            "toLocationId"   TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE RESTRICT,
            "qty"            INTEGER NOT NULL,
            "movedBy"        TEXT NOT NULL,
            "movedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note"           TEXT
        )
    `);
    console.log('  ✓ InvTransfer');

    // ── Migration idempotente : templateId sur InvLocation ────────

    console.log('\n▶ Vérification colonne InvLocation.templateId...');
    const cols = await db.execute(`PRAGMA table_info("InvLocation")`);
    if (!cols.rows.some(r => r.name === 'templateId')) {
        await db.execute(`
            ALTER TABLE "InvLocation"
            ADD COLUMN "templateId" TEXT REFERENCES "InvBagTemplate"("id") ON DELETE SET NULL
        `);
        console.log('  ✓ Colonne templateId ajoutée');
    } else {
        console.log('  ✓ Colonne templateId déjà présente');
    }

    // ── Seed : emplacements singleton ────────────────────────────

    console.log('\n▶ Seed des emplacements singleton...');
    await db.execute({
        sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name) VALUES (?, 'STOCK_CENTRAL', 'Stock Central')`,
        args: [crypto.randomUUID()],
    });
    console.log('  ✓ Stock Central');

    await db.execute({
        sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name) VALUES (?, 'PHARMA_TAMPON', 'Pharmacie Tampon')`,
        args: [crypto.randomUUID()],
    });
    console.log('  ✓ Pharmacie Tampon');

    console.log('\n✅ Migration inventaire terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
