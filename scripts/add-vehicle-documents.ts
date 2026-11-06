/**
 * Migration production — documents liés à un véhicule (plusieurs fichiers).
 *
 *   Crée la table VehicleDocument (id, vehicleId, r2Key unique, fileName, size, createdAt)
 *   et son index sur vehicleId, puis reprend chaque guide de vérification existant
 *   (Vehicle.guideR2Key) comme premier document du véhicule.
 *
 * Aucun objet R2 n'est déplacé ni supprimé : la ligne reprend la même clé
 * `vehicle-guides/…`. Les colonnes Vehicle.guide* sont conservées (retour arrière
 * possible). Idempotent : un guide dont la clé figure déjà dans VehicleDocument
 * n'est pas repris deux fois — la relance rattrape donc un guide déposé entre la
 * migration et la bascule, sans ressusciter un document retiré (son retrait remet
 * les colonnes guide* à NULL).
 *
 * L'écriture est atomique : table, index et reprises passent dans une seule
 * transaction, tout ou rien.
 *
 * À exécuter AVANT le déploiement de la v5.44.0 : sans la table, les routes
 * /api/vehicles/[id]/documents*, /api/qr/[token]/documents/* et les fiches
 * véhicule (GET /api/vehicles/[id], GET /api/qr/[token]/vehicle) répondent 500.
 *
 * Usage :
 *   npx tsx scripts/add-vehicle-documents.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-vehicle-documents.ts --apply    # applique, puis vérifie
 */
import { createClient, type InStatement } from '@libsql/client';
import "dotenv/config";
import { VEHICLE_DOCUMENT_DDL, VEHICLE_DOCUMENT_INDEX_DDL } from '../src/lib/vehicleDocuments/schema';

const DEFAULT_FILE_NAME = 'guide-verification.pdf';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : documents liés au véhicule ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const tableRes = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'VehicleDocument'`);
    const tableExists = tableRes.rows.length > 0;
    console.log(`  table VehicleDocument : ${tableExists ? 'présente' : 'ABSENTE'}`);

    const guideCols = await db.execute(`PRAGMA table_info("Vehicle")`);
    if (!guideCols.rows.some(r => r.name === 'guideR2Key')) {
        console.error("❌ Colonne Vehicle.guideR2Key absente : exécuter d'abord scripts/add-vehicle-guide.ts");
        process.exit(1);
    }

    // Guides à reprendre : clé renseignée et absente de VehicleDocument (si la table existe).
    const guidesSql = tableExists
        ? `SELECT id, guideR2Key, guideFileName, guideSize, guideUpdatedAt FROM Vehicle
           WHERE guideR2Key IS NOT NULL AND guideR2Key NOT IN (SELECT r2Key FROM VehicleDocument)`
        : `SELECT id, guideR2Key, guideFileName, guideSize, guideUpdatedAt FROM Vehicle WHERE guideR2Key IS NOT NULL`;
    const guides = (await db.execute(guidesSql)).rows;
    console.log(`  guides à reprendre : ${guides.length}`);

    if (tableExists && guides.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!tableExists) console.log('  CREATE TABLE VehicleDocument + index vehicleId');
        for (const g of guides) {
            console.log(`  reprise du guide ${String(g.guideR2Key)} (véhicule ${String(g.id)})`);
        }
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    const now = new Date().toISOString();
    const statements: InStatement[] = [VEHICLE_DOCUMENT_DDL, VEHICLE_DOCUMENT_INDEX_DDL];
    for (const g of guides) {
        statements.push({
            // `OR IGNORE` : la contrainte UNIQUE sur r2Key garantit l'absence de doublon même
            // si un autre processus a repris le guide entre la lecture et l'écriture.
            sql: `INSERT OR IGNORE INTO VehicleDocument (id, vehicleId, r2Key, fileName, size, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
                crypto.randomUUID(),
                g.id as string,
                g.guideR2Key as string,
                (g.guideFileName as string | null) || DEFAULT_FILE_NAME,
                Number(g.guideSize ?? 0),
                (g.guideUpdatedAt as string | null) || now,
            ],
        });
    }
    // Un seul lot en transaction d'écriture : tout est appliqué, ou rien.
    await db.batch(statements, 'write');
    console.log(`✅ Table créée et ${guides.length} guide(s) repris`);

    // Vérification : chaque guide a désormais une ligne portant sa clé.
    const missing = await db.execute(
        `SELECT id, guideR2Key FROM Vehicle
         WHERE guideR2Key IS NOT NULL AND guideR2Key NOT IN (SELECT r2Key FROM VehicleDocument)`
    );
    if (missing.rows.length > 0) {
        console.error(`❌ ${missing.rows.length} guide(s) non repris après migration`);
        process.exit(1);
    }
    const total = await db.execute(`SELECT COUNT(*) AS n FROM VehicleDocument`);
    console.log(`✅ Vérification : tous les guides sont repris (${String(total.rows[0].n)} document(s) au total)`);
    console.log("ℹ️ Les objets R2 n'ont pas bougé et les colonnes Vehicle.guide* sont conservées.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
