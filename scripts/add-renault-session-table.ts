import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for RenaultSession...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS RenaultSession (
                id INTEGER PRIMARY KEY DEFAULT 1,
                idToken TEXT NOT NULL,
                accountId TEXT NOT NULL,
                expiresAt INTEGER NOT NULL
            )
        `);
        console.log("Created RenaultSession table successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
