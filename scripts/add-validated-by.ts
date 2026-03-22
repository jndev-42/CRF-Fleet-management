/**
 * Migration de production — Colonne validated_by sur la table User.
 *
 * Ajoute la colonne `validated_by TEXT` (nullable) qui stocke le nom
 * (ou l'email) de l'ADMIN/RESPO ayant validé les papiers d'un chauffeur.
 *
 * Idempotent : sans effet si la colonne existe déjà.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-validated-by.ts
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
    console.log('\n▶ Migration : User.validated_by...');

    try {
        await db.execute(`ALTER TABLE "User" ADD COLUMN "validated_by" TEXT`);
        console.log('  ✓ Colonne validated_by ajoutée');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
    } catch (e: any) {
        if (e?.message?.includes('duplicate column') || e?.message?.includes('already exists')) {
            console.log('  ~ validated_by (déjà présente, rien à faire)');
        } else {
            console.error('  ✗', e?.message);
            process.exit(1);
        }
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
