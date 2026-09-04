/**
 * Migration production — ajoute la colonne Vehicle.transmission
 * ('Manuelle' | 'Automatique', NULL tant que non renseignée).
 *
 * Usage : npx tsx scripts/add-vehicle-transmission.ts
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Migration : ajout de la colonne Vehicle.transmission...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("Vehicle")`);
    if (cols.rows.some(r => r.name === 'transmission')) {
        console.log("⚠️ Colonne transmission déjà présente — rien à faire");
        return;
    }

    await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "transmission" TEXT`);
    console.log("✅ Colonne transmission ajoutée");
    console.log("ℹ️ Les véhicules existants restent à NULL : aucun tag ne s'affiche tant que la boîte n'est pas renseignée depuis la fiche véhicule.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
