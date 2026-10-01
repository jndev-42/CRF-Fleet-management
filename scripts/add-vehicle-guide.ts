/**
 * Migration production — colonnes du guide de vérification PDF d'un véhicule.
 *
 *   Vehicle.guideR2Key      clé de l'objet dans R2 (préfixe `vehicle-guides/`)
 *   Vehicle.guideFileName   nom d'origine du fichier, restitué au téléchargement
 *   Vehicle.guideSize       taille en octets
 *   Vehicle.guideUpdatedAt  date ISO du dernier dépôt
 *
 * À exécuter AVANT le déploiement : `/api/vehicles/[id]/guide` et
 * `/api/qr/[token]/guide` lisent et écrivent ces colonnes nommément — sans elles,
 * chaque dépôt, lecture ou retrait de guide répond 500. (Les fiches véhicule, en
 * `SELECT *`, se contentent de ne pas afficher la carte.)
 *
 * Usage :
 *   npx tsx scripts/add-vehicle-guide.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-vehicle-guide.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

const COLUMNS: Array<[string, string]> = [
    ['guideR2Key', 'TEXT'],
    ['guideFileName', 'TEXT'],
    ['guideSize', 'INTEGER'],
    ['guideUpdatedAt', 'TEXT'],
];

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : guide de vérification véhicule ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("Vehicle")`);
    const existing = new Set(cols.rows.map(r => r.name as string));
    const missing = COLUMNS.filter(([name]) => !existing.has(name));

    for (const [name] of COLUMNS) {
        console.log(`  colonne ${name} : ${existing.has(name) ? 'présente' : 'ABSENTE'}`);
    }

    if (missing.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const [name, type] of missing) {
            console.log(`  ALTER TABLE "Vehicle" ADD COLUMN "${name}" ${type}`);
        }
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    for (const [name, type] of missing) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "${name}" ${type}`);
        console.log(`✅ Colonne ${name} ajoutée`);
    }

    const after = await db.execute(`PRAGMA table_info("Vehicle")`);
    const afterNames = new Set(after.rows.map(r => r.name as string));
    const stillMissing = COLUMNS.filter(([name]) => !afterNames.has(name));
    if (stillMissing.length > 0) {
        console.error(`❌ Colonnes absentes après migration : ${stillMissing.map(([n]) => n).join(', ')}`);
        process.exit(1);
    }
    console.log("✅ Colonnes du guide confirmées");
    console.log("ℹ️ Les véhicules existants restent sans guide : aucune carte ne s'affiche tant qu'un administrateur n'en a pas joint un.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
