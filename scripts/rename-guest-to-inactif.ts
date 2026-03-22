/**
 * rename-guest-to-inactif.ts
 *
 * Migration idempotente : renomme le rôle GUEST → INACTIF dans la table Role.
 * À exécuter une fois sur la base de données Turso cloud.
 *
 * Usage: npx tsx scripts/rename-guest-to-inactif.ts
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    const existing = await db.execute({
        sql: `SELECT id, name FROM "Role" WHERE name IN ('GUEST', 'INACTIF')`,
        args: [],
    });

    const hasGuest = existing.rows.some(r => r.name === 'GUEST');
    const hasInactif = existing.rows.some(r => r.name === 'INACTIF');

    if (!hasGuest && hasInactif) {
        console.log('✅ Le rôle GUEST a déjà été renommé en INACTIF. Rien à faire.');
        return;
    }

    if (!hasGuest && !hasInactif) {
        console.log('⚠️  Aucun rôle GUEST ou INACTIF trouvé. Vérifiez la base de données.');
        return;
    }

    await db.execute({
        sql: `UPDATE "Role" SET name = 'INACTIF' WHERE name = 'GUEST'`,
        args: [],
    });

    console.log('✅ Rôle GUEST renommé en INACTIF avec succès.');
}

main().catch(e => {
    console.error('Erreur lors de la migration:', e);
    process.exit(1);
});
