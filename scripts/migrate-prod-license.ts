/**
 * Migration de production — Validation des papiers (permis de conduire).
 *
 * Ce script :
 *   1. Ajoute 3 colonnes sur la table "User" (idempotentes) :
 *      - papiers_valides  INTEGER  (1 par défaut pour les non-chauffeurs, 0 pour CHVL/CHVPSP)
 *      - last_validation  TEXT     (date ISO de dernière validation, nullable)
 *      - start_date_invalidation_process TEXT  (date ISO début du processus d'invalidation, nullable)
 *   2. Initialise papiers_valides = 0 et start_date_invalidation_process = today
 *      pour tous les utilisateurs ayant le rôle CHVL ou CHVPSP.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate-prod-license.ts
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
    // ── 1. Migrations de colonnes (idempotentes) ──────────────────────────────
    console.log('\n▶ Migrations de schéma sur "User"...');

    const schemaMigrations = [
        {
            name: 'User.papiers_valides',
            sql: `ALTER TABLE "User" ADD COLUMN "papiers_valides" INTEGER NOT NULL DEFAULT 1`,
        },
        {
            name: 'User.last_validation',
            sql: `ALTER TABLE "User" ADD COLUMN "last_validation" TEXT`,
        },
        {
            name: 'User.start_date_invalidation_process',
            sql: `ALTER TABLE "User" ADD COLUMN "start_date_invalidation_process" TEXT`,
        },
    ];

    for (const m of schemaMigrations) {
        try {
            await db.execute(m.sql);
            console.log('  ✓', m.name, 'ajoutée');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
        } catch (e: any) {
            if (e?.message?.includes('duplicate column') || e?.message?.includes('already exists')) {
                console.log('  ~', m.name, '(déjà présente)');
            } else {
                console.error('  ✗', m.name, e?.message);
                process.exit(1);
            }
        }
    }

    // ── 2. Initialisation des chauffeurs (CHVL / CHVPSP) ─────────────────────
    console.log('\n▶ Initialisation des chauffeurs...');

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const driversRes = await db.execute(`
        SELECT DISTINCT u.id, u.email
        FROM "User" u
        JOIN "UserRole" ur ON u.id = ur.userId
        JOIN "Role" r ON ur.roleId = r.id
        WHERE r.name IN ('CHVL', 'CHVPSP')
    `);

    if (driversRes.rows.length === 0) {
        console.log('  ⚠ Aucun chauffeur trouvé (rôles CHVL / CHVPSP)');
    } else {
        for (const row of driversRes.rows) {
            const userId = row.id as string;
            const email  = row.email as string;

            await db.execute({
                sql: `UPDATE "User"
                      SET papiers_valides = 0,
                          start_date_invalidation_process = ?
                      WHERE id = ?`,
                args: [today, userId],
            });
            console.log(`  ✓ ${email} → papiers_valides=0, start_date_invalidation_process=${today}`);
        }
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
