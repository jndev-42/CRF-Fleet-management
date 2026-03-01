import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration to add 2nd driver...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        // Add secondDriverName and secondDriverEmail columns
        await db.execute(`
            ALTER TABLE "Trip" ADD COLUMN "secondDriverName" TEXT;
        `);
        console.log("Added secondDriverName column");

        await db.execute(`
            ALTER TABLE "Trip" ADD COLUMN "secondDriverEmail" TEXT;
        `);
        console.log("Added secondDriverEmail column");

        console.log("Migration finished successfully.");
    } catch (error: any) {
        if (error.message?.includes('duplicate column name')) {
            console.log("Columns already exist.");
        } else {
            console.error("Migration failed:", error);
        }
    }
}

main().catch(console.error);
