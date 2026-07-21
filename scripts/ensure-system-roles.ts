import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

const MANAGEABLE_ROLES = [
    'SUPER_ADMIN',
    'ADMIN',
    'PRESIDENT',
    'TRESORIER',
    'CADRE',
    'CHVPSP',
    'CHVL',
    'CI/RPAPS',
    'INACTIF'
];

async function run() {
    console.log(`▶ Seed des rôles système sur ${url}...`);

    for (const roleName of MANAGEABLE_ROLES) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
            args: [`role-${roleName.toLowerCase().replace('/', '-')}`, roleName]
        });
        console.log(`  ✓ Rôle ${roleName} assuré`);
    }

    const currentRoles = await db.execute(`SELECT id, name FROM "Role"`);
    console.log('\n📊 Rôles enregistrés en base :');
    for (const row of currentRoles.rows) {
        console.log(`  • ${row.name} (${row.id})`);
    }

    console.log('\n✅ Terminé avec succès.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
