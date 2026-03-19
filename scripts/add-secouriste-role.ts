/**
 * Migration de production — Ajout du rôle SECOURISTE.
 *
 * Ce script insère le rôle SECOURISTE dans la table Role (idempotent via INSERT OR IGNORE).
 * À exécuter une seule fois sur la base de production Turso après déploiement.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-secouriste-role.ts
 */
import { createClient } from '@libsql/client';
import crypto from 'crypto';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    console.log('\n▶ Insertion du rôle SECOURISTE...');

    // INSERT OR IGNORE : idempotent si le rôle existe déjà avec le même nom
    // On vérifie d'abord l'existence pour ne pas générer un nouvel UUID inutile
    const existing = await db.execute({
        sql: `SELECT id FROM "Role" WHERE name = ?`,
        args: ['SECOURISTE'],
    });

    if (existing.rows.length > 0) {
        console.log('  ~ SECOURISTE déjà présent (id:', existing.rows[0].id, ')');
    } else {
        const id = crypto.randomUUID();
        await db.execute({
            sql: `INSERT INTO "Role" (id, name) VALUES (?, ?)`,
            args: [id, 'SECOURISTE'],
        });
        console.log('  ✓ SECOURISTE inséré (id:', id, ')');
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
