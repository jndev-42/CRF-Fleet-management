/**
 * Migration de production — Ajout du rôle CI/RPAPS + backfill SECOURISTE.
 *
 * Ce script :
 *   1. Insère le rôle CI/RPAPS dans la table Role (idempotent via INSERT OR IGNORE).
 *   2. Ajoute le rôle SECOURISTE à tous les utilisateurs non-GUEST qui ne l'ont pas encore.
 *
 * À exécuter une seule fois sur la base de production Turso après déploiement.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-ci-rpaps-role.ts
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
    // 1. Insérer CI/RPAPS
    console.log('\n▶ Insertion du rôle CI/RPAPS...');
    const existingCi = await db.execute({
        sql: `SELECT id FROM "Role" WHERE name = ?`,
        args: ['CI/RPAPS'],
    });

    if (existingCi.rows.length > 0) {
        console.log('  ~ CI/RPAPS déjà présent (id:', existingCi.rows[0].id, ')');
    } else {
        const id = crypto.randomUUID();
        await db.execute({
            sql: `INSERT INTO "Role" (id, name) VALUES (?, ?)`,
            args: [id, 'CI/RPAPS'],
        });
        console.log('  ✓ CI/RPAPS inséré (id:', id, ')');
    }

    // 2. Backfill SECOURISTE
    console.log('\n▶ Backfill SECOURISTE pour les non-GUEST...');

    const secouristeRow = await db.execute({
        sql: `SELECT id FROM "Role" WHERE name = ?`,
        args: ['SECOURISTE'],
    });

    if (secouristeRow.rows.length === 0) {
        console.log('  ✗ Rôle SECOURISTE introuvable — exécutez add-secouriste-role.ts en premier');
        process.exit(1);
    }

    const secouristeId = secouristeRow.rows[0].id as string;

    // Tous les utilisateurs ayant au moins un rôle non-GUEST et sans SECOURISTE
    const usersToBackfill = await db.execute({
        sql: `SELECT DISTINCT ur.userId FROM "UserRole" ur
              JOIN "Role" r ON ur.roleId = r.id
              WHERE r.name != 'GUEST'
                AND ur.userId NOT IN (
                    SELECT userId FROM "UserRole" WHERE roleId = ?
                )`,
        args: [secouristeId],
    });

    if (usersToBackfill.rows.length === 0) {
        console.log('  ~ Tous les utilisateurs éligibles ont déjà le rôle SECOURISTE');
    } else {
        for (const row of usersToBackfill.rows) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                args: [row.userId, secouristeId],
            });
        }
        console.log(`  ✓ ${usersToBackfill.rows.length} utilisateur(s) mis à jour avec SECOURISTE`);
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
