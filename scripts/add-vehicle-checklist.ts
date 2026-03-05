import { createClient } from '@libsql/client';
import "dotenv/config";

/**
 * Migration script: adds custom per-vehicle checklist support.
 *
 * Creates:
 *   - VehicleChecklistItem table (label, type: checkout|checkin, required, order)
 *   - checklistOut and checklistIn columns on Trip (JSON string of { itemId: boolean })
 *
 * Run with: npx tsx scripts/add-vehicle-checklist.ts
 */
async function main() {
    console.log("Starting DB migration for VehicleChecklist...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        // 1. Create VehicleChecklistItem table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "VehicleChecklistItem" (
                "id"        TEXT NOT NULL PRIMARY KEY,
                "vehicleId" TEXT NOT NULL,
                "label"     TEXT NOT NULL,
                "type"      TEXT NOT NULL CHECK ("type" IN ('checkout', 'checkin')),
                "required"  INTEGER NOT NULL DEFAULT 0,
                "order"     INTEGER NOT NULL DEFAULT 0,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "VehicleChecklistItem_vehicleId_fkey"
                    FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE
            )
        `);
        console.log("Created VehicleChecklistItem table.");

        // 2. Index for fast lookups by vehicle + type
        await db.execute(`
            CREATE INDEX IF NOT EXISTS "VehicleChecklistItem_vehicleId_type_idx"
            ON "VehicleChecklistItem"("vehicleId", "type")
        `);
        console.log("Created index on VehicleChecklistItem.");

        // 3. Add checklistOut column to Trip (JSON blob, nullable)
        try {
            await db.execute(`ALTER TABLE "Trip" ADD COLUMN "checklistOut" TEXT`);
            console.log("Added checklistOut column to Trip.");
        } catch {
            console.log("checklistOut column may already exist, skipping.");
        }

        // 4. Add checklistIn column to Trip (JSON blob, nullable)
        try {
            await db.execute(`ALTER TABLE "Trip" ADD COLUMN "checklistIn" TEXT`);
            console.log("Added checklistIn column to Trip.");
        } catch {
            console.log("checklistIn column may already exist, skipping.");
        }

        console.log("\n✅ Migration completed successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
