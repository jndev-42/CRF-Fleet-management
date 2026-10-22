/**
 * Migration production — abonnements Web Push.
 *
 * Crée la table `PushSubscription` (un abonnement par navigateur/appareil, rattaché à
 * l'utilisateur) et son index sur `userId`. Idempotente : ne crée que ce qui manque.
 *
 * À exécuter AVANT le déploiement de la v5.27.0 : sans la table, `POST /api/push/subscriptions`
 * répond 500 (abonnement impossible) et l'envoi des notifications push est ignoré (les
 * notifications in-app, elles, continuent d'être créées).
 *
 * Les variables d'environnement `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT`
 * doivent aussi être définies (clés : `npx web-push generate-vapid-keys`).
 *
 * Usage :
 *   npx tsx scripts/add-push-subscriptions.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-push-subscriptions.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import {
    PUSH_SUBSCRIPTION_DDL,
    PUSH_SUBSCRIPTION_TABLE,
    PUSH_SUBSCRIPTION_USER_INDEX_DDL,
} from '../src/lib/push/schema';

const INDEX_NAME = 'idx_PushSubscription_userId';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : abonnements Web Push ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const hasObject = async (type: 'table' | 'index', name: string) => (await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = ? AND name = ?`,
        args: [type, name],
    })).rows.length > 0;

    const objects = [
        { type: 'table' as const, name: PUSH_SUBSCRIPTION_TABLE, ddl: PUSH_SUBSCRIPTION_DDL },
        { type: 'index' as const, name: INDEX_NAME, ddl: PUSH_SUBSCRIPTION_USER_INDEX_DDL },
    ];

    const missing: typeof objects = [];
    for (const object of objects) {
        const present = await hasObject(object.type, object.name);
        console.log(`  ${object.type} ${object.name} : ${present ? 'présent' : 'ABSENT'}`);
        if (!present) missing.push(object);
    }

    if (missing.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const object of missing) console.log(`  ${object.ddl.replace(/\s+/g, ' ')}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    for (const object of missing) await db.execute(object.ddl);

    for (const object of objects) {
        if (!(await hasObject(object.type, object.name))) {
            console.error(`❌ ${object.type} ${object.name} absent après migration — migration NON valide`);
            process.exit(1);
        }
    }
    console.log("✅ Table des abonnements Web Push confirmée");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
