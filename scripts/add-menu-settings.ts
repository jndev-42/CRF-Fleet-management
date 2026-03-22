/**
 * Migration de production — Création de la table MenuSetting.
 *
 * Ce script :
 *   1. Crée la table MenuSetting si elle n'existe pas.
 *   2. Insère les 3 entrées par défaut (stats, inventory, missions) en mode idempotent.
 *
 * À exécuter une seule fois sur la base de production Turso après déploiement.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-menu-settings.ts
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
    console.log('\n▶ Création de la table MenuSetting...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "MenuSetting" (
            "menu_key"   TEXT NOT NULL PRIMARY KEY,
            "visibility" TEXT NOT NULL DEFAULT 'available'
                         CHECK (visibility IN ('available', 'admin_only', 'disabled')),
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table MenuSetting prête');

    console.log('\n▶ Seed des paramètres par défaut...');
    const defaults = ['stats', 'inventory', 'missions'] as const;
    for (const key of defaults) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`,
            args: [key, 'available'],
        });
        console.log(`  ✓ ${key} → available`);
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
