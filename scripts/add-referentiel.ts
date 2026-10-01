/**
 * Migration production — chatbot du référentiel secourisme.
 *
 * Crée `Referentiel`, `ReferentielPage` et la table virtuelle FTS5
 * `ReferentielFts` (contenu externe sur `ReferentielPage`, insensible aux accents).
 *
 * FTS5 doit être disponible sur la base cible : la migration le TESTE d'abord
 * (table virtuelle temporaire) et s'arrête avec un message clair s'il manque.
 *
 * À exécuter AVANT le déploiement : sans les tables, `/api/referentiel/*`
 * répond 500 et le chatbot affiche une erreur.
 *
 * Usage :
 *   npx tsx scripts/add-referentiel.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-referentiel.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import {
    REFERENTIEL_FTS_DDL,
    REFERENTIEL_FTS_TABLE,
    REFERENTIEL_TABLES,
} from '../src/lib/referentiel/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : référentiel secourisme ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    // Test FTS5 avec une table TEMP, dans UN batch (une seule connexion : sur Turso, en
    // HTTP, une table temporaire ne survit pas d'une requête à l'autre). Elle disparaît
    // avec la connexion, donc même le dry-run n'écrit rien de persistant.
    try {
        await db.batch([
            `CREATE VIRTUAL TABLE temp."_fts5_probe" USING fts5(x, tokenize='unicode61 remove_diacritics 2')`,
            `DROP TABLE temp."_fts5_probe"`,
        ], 'write');
        console.log("  FTS5 : disponible");
    } catch (error: unknown) {
        console.error(
            "❌ FTS5 indisponible sur cette base — le référentiel ne peut pas être indexé :",
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    }

    const existing = new Set(
        (await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(r => String(r.name)),
    );
    const missingTables = REFERENTIEL_TABLES.filter(t => !existing.has(t.name));
    const hasFts = existing.has(REFERENTIEL_FTS_TABLE);

    for (const t of REFERENTIEL_TABLES) console.log(`  table ${t.name} : ${existing.has(t.name) ? 'présente' : 'ABSENTE'}`);
    console.log(`  table ${REFERENTIEL_FTS_TABLE} (FTS5) : ${hasFts ? 'présente' : 'ABSENTE'}`);

    if (missingTables.length === 0 && hasFts) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const t of missingTables) console.log(`  ${t.ddl.replace(/\s+/g, ' ')}`);
        if (!hasFts) console.log(`  ${REFERENTIEL_FTS_DDL.replace(/\s+/g, ' ')}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    // `Referentiel` avant `ReferentielPage` (clé étrangère), l'index FTS en dernier.
    for (const t of REFERENTIEL_TABLES) await db.execute(t.ddl);
    await db.execute(REFERENTIEL_FTS_DDL);

    const after = new Set(
        (await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)).rows.map(r => String(r.name)),
    );
    const failures = [...REFERENTIEL_TABLES.map(t => t.name), REFERENTIEL_FTS_TABLE].filter(n => !after.has(n));
    if (failures.length > 0) {
        console.error(`❌ Absents après migration : ${failures.join(', ')} — migration NON valide`);
        process.exit(1);
    }
    // Requête réelle sur l'index : prouve que le tokenizer est bien accepté.
    await db.execute(`SELECT rowid FROM "${REFERENTIEL_FTS_TABLE}" WHERE "${REFERENTIEL_FTS_TABLE}" MATCH '"test"*' LIMIT 1`);
    console.log("✅ Tables et index FTS5 confirmés");
    console.log("ℹ️ Aucun référentiel n'est importé : un super admin le téléverse depuis Administration > Référentiel.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
