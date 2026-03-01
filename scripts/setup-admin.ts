import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "Admin" (
                "email" TEXT NOT NULL PRIMARY KEY,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Admin table created successfully.");

        // Insert user as first admin
        const initialAdmin = "jeannoel.durand@croix-rouge.fr";
        await db.execute({
            sql: `INSERT OR IGNORE INTO "Admin" (email) VALUES (?)`,
            args: [initialAdmin]
        });
        console.log(`Inserted initial admin: ${initialAdmin}`);

    } catch (error) {
        console.error("Error setting up Admin table:", error);
    }
}
main().catch(console.error);
