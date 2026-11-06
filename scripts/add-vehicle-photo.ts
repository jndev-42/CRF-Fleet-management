/**
 * Migration production — colonnes de la photo d'un véhicule.
 *
 *   Vehicle.photoR2Key      clé de l'objet dans R2 (préfixe `vehicle-photos/`)
 *   Vehicle.photoUpdatedAt  date ISO du dernier dépôt, version de l'URL de la photo
 *
 * À exécuter AVANT le déploiement : `/api/vehicles/[id]/photo`,
 * `/api/qr/[token]/photo` et la suppression d'un véhicule lisent ces colonnes
 * nommément — sans elles, ces routes répondent 500.
 *
 * Usage :
 *   npx tsx scripts/add-vehicle-photo.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-vehicle-photo.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

const COLUMNS: Array<[string, string]> = [
    ['photoR2Key', 'TEXT'],
    ['photoUpdatedAt', 'TEXT'],
];

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : photo de véhicule ${apply ? '(--apply)' : '(dry-run)'}`);

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
    console.log("✅ Colonnes de la photo confirmées");
    console.log("ℹ️ Les véhicules existants restent sans photo : aucune vignette ne s'affiche tant qu'un gestionnaire n'en a pas déposé une.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
