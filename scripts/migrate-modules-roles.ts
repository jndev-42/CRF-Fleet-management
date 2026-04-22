import { createClient } from '@libsql/client';
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

async function run() {
    console.log('\n▶ Démarrage de la migration MenuSetting vers ModuleSetting...');

    const db = createClient({
        url: url || 'file:local.db',
        authToken: authToken
    });

    // 1. Récupérer les anciennes données si elles existent
    let oldSettings: any[] = [];
    try {
        const res = await db.execute('SELECT * FROM "MenuSetting"');
        oldSettings = res.rows;
        console.log(`  ✓ ${oldSettings.length} anciens paramètres trouvés.`);
    } catch (e) {
        console.log('  ℹ La table MenuSetting n\'existe pas encore ou est vide.');
    }

    // 2. Créer la nouvelle table
    console.log('\n▶ Création de la table ModuleSetting...');
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "ModuleSetting" (
            "module_key"    TEXT NOT NULL PRIMARY KEY,
            "allowed_roles" TEXT NOT NULL,
            "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table ModuleSetting prête.');

    // 3. Migrer les données
    console.log('\n▶ Migration des données...');
    const defaultRolesForKey: Record<string, string[]> = {
        'stats': ['ADMIN', 'RESPO', 'CI/RPAPS', 'CHVPSP', 'CHVL', 'SECOURISTE'],
        'inventory': ['ADMIN', 'SECOURISTE'],
        'missions': ['ADMIN', 'CI/RPAPS']
    };

    const modulesToSeed = ['stats', 'inventory', 'missions'];

    for (const key of modulesToSeed) {
        const old = oldSettings.find(s => s.menu_key === key);
        let allowedRoles: string[];

        if (old) {
            if (old.visibility === 'admin_only') {
                allowedRoles = ['ADMIN'];
            } else if (old.visibility === 'disabled') {
                allowedRoles = [];
            } else {
                // available
                allowedRoles = defaultRolesForKey[key] || ['ADMIN'];
            }
        } else {
            allowedRoles = defaultRolesForKey[key] || ['ADMIN'];
        }

        await db.execute({
            sql: `INSERT OR REPLACE INTO "ModuleSetting" (module_key, allowed_roles) VALUES (?, ?)`,
            args: [key, JSON.stringify(allowedRoles)],
        });
        console.log(`  ✓ ${key} → ${JSON.stringify(allowedRoles)}`);
    }

    // 4. Supprimer l'ancienne table si elle existait
    if (oldSettings.length > 0) {
        console.log('\n▶ Suppression de l\'ancienne table MenuSetting...');
        await db.execute('DROP TABLE "MenuSetting"');
        console.log('  ✓ Ancienne table supprimée.');
    }

    console.log('\n✅ Migration terminée avec succès.\n');
}

run().catch(e => {
    console.error('❌ Erreur lors de la migration :', e);
    process.exit(1);
});
