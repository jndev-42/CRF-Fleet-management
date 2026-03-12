import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration: add status column to Reservation...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        await db.execute(`
            ALTER TABLE "Reservation"
            ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING'
        `);
        console.log("Added 'status' column to Reservation table (default: PENDING).");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
    } catch (error: any) {
        if (error?.message?.includes('duplicate column')) {
            console.log("Column 'status' already exists, skipping.");
        } else {
            console.error("Migration failed:", error);
            process.exit(1);
        }
    }
}

main().catch(console.error);
