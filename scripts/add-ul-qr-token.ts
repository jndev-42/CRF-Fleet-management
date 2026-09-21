/**
 * Migration production — colonne `UniteLocale.qrToken` et son index unique partiel.
 *
 * Le token est la SEULE frontière d'accès au dépôt d'un compte rendu de mission
 * par QR Code : deux UL portant le même token deviendraient indiscernables, et
 * un rapport se retrouverait rattaché à l'autre. D'où l'index unique, partiel
 * (`WHERE qrToken IS NOT NULL`) pour que les UL sans token coexistent librement.
 *
 * À exécuter AVANT le déploiement : la colonne est lue dès le premier appel à
 * `/api/ul/[id]/qr-token` et à `/api/qr-ul/[token]` — tant qu'elle manque en
 * production, chaque scan répond 500, indiscernable d'une panne.
 *
 * Usage :
 *   npx tsx scripts/add-ul-qr-token.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-ul-qr-token.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

const INDEX_NAME = 'UniteLocale_qrToken_key';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : UniteLocale.qrToken ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("UniteLocale")`);
    const hasColumn = cols.rows.some(r => r.name === 'qrToken');

    const indexes = await db.execute(`PRAGMA index_list("UniteLocale")`);
    const hasIndex = indexes.rows.some(r => r.name === INDEX_NAME);

    console.log(`  colonne qrToken : ${hasColumn ? 'présente' : 'ABSENTE'}`);
    console.log(`  index ${INDEX_NAME} : ${hasIndex ? 'présent' : 'ABSENT'}`);

    // Contrôle préalable : un doublon existant ferait échouer la création de
    // l'index, et le faire découvrir par l'erreur brute d'SQLite ne dirait pas
    // QUELLES UL sont en cause.
    if (hasColumn) {
        const dupes = await db.execute(`
            SELECT qrToken, COUNT(*) AS c
              FROM "UniteLocale"
             WHERE qrToken IS NOT NULL
             GROUP BY qrToken
            HAVING c > 1
        `);
        if (dupes.rows.length > 0) {
            console.error("❌ Tokens dupliqués — index impossible. À trancher avant de rejouer :");
            for (const row of dupes.rows) {
                console.error(`   ${row.qrToken} × ${row.c}`);
            }
            process.exit(1);
        }
    }

    if (hasColumn && hasIndex) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!hasColumn) console.log(`  ALTER TABLE "UniteLocale" ADD COLUMN "qrToken" TEXT`);
        if (!hasIndex) console.log(`  CREATE UNIQUE INDEX "${INDEX_NAME}" ON "UniteLocale"("qrToken") WHERE "qrToken" IS NOT NULL`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    if (!hasColumn) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "qrToken" TEXT`);
        console.log("✅ Colonne qrToken ajoutée");
    }

    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "UniteLocale"("qrToken") WHERE "qrToken" IS NOT NULL`);

    // Vérification explicite plutôt que confiance dans l'absence d'exception :
    // l'index est l'unique protection contre une collision de tokens, donc
    // contre un rapport déposé sur la mauvaise UL.
    const after = await db.execute(`PRAGMA index_list("UniteLocale")`);
    if (!after.rows.some(r => r.name === INDEX_NAME)) {
        console.error(`❌ Index ${INDEX_NAME} absent après création — migration NON valide`);
        process.exit(1);
    }
    console.log(`✅ Index ${INDEX_NAME} confirmé`);
    console.log("ℹ️ Les UL existantes restent sans token : il est créé au premier appel à /api/ul/[id]/qr-token.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
