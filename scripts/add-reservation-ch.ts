import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for Reservation.ch column...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        const resCols = await db.execute(`PRAGMA table_info("Reservation")`);
        if (!resCols.rows.some(r => r.name === 'ch')) {
            await db.execute(`ALTER TABLE "Reservation" ADD COLUMN "ch" TEXT DEFAULT 'CH non décidé'`);
            console.log("Added column 'ch' to Reservation table successfully.");
        } else {
            console.log("Column 'ch' already exists on Reservation table.");
        }
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
