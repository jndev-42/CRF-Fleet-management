import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration to add vin and fuelType...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        // Add vin column
        try {
            await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "vin" TEXT;`);
            console.log("✅ Added vin column");
        } catch (e: any) {
            if (e.message?.includes('duplicate column name')) {
                console.log("⚠️ vin column already exists");
            } else {
                throw e;
            }
        }

        // Add fuelType column
        try {
            await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "fuelType" TEXT;`);
            console.log("✅ Added fuelType column");
        } catch (e: any) {
            if (e.message?.includes('duplicate column name')) {
                console.log("⚠️ fuelType column already exists");
            } else {
                throw e;
            }
        }

        // Backfill data
        // VL186 (Electric)
        await db.execute({
            sql: `UPDATE "Vehicle" SET "vin" = ?, "fuelType" = ? WHERE "name" LIKE '%VL186%'`,
            args: ['VYSP01H0876365199', 'Électrique']
        });

        // VL188 (Electric)
        await db.execute({
            sql: `UPDATE "Vehicle" SET "vin" = ?, "fuelType" = ? WHERE "name" LIKE '%VL188%'`,
            args: ['VF1RHN00472485396', 'Électrique']
        });

        // 182 (Diesel)
        await db.execute({
            sql: `UPDATE "Vehicle" SET "fuelType" = ? WHERE "name" LIKE '%182%'`,
            args: ['Diesel']
        });

        // Other generic VLs -> Essence (as a safe default fallback for the prompt, user asked for other VLs to trace as Essence but we can just leave null or Essence)
        await db.execute({
            sql: `UPDATE "Vehicle" SET "fuelType" = ? WHERE "fuelType" IS NULL`,
            args: ['Essence']
        });

        console.log("🎉 Migration backfill finished successfully.");
    } catch (error: any) {
        console.error("❌ Migration failed:", error);
    }
}

main().catch(console.error);
