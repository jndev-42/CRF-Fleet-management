import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration to add driveFolderId...");

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!.trim(),
        authToken: process.env.TURSO_AUTH_TOKEN?.trim()
    });

    try {
        await db.execute('ALTER TABLE "Trip" ADD COLUMN driveFolderId TEXT;');
        console.log("✅ Added driveFolderId column to Trip table");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
    } catch (e: any) {
        if (e.message && e.message.includes("duplicate column name")) {
            console.log("⚠️ driveFolderId column already exists.");
        } else {
            console.error("❌ Error adding driveFolderId column:", e);
        }
    }

    console.log("🎉 Migration finished successfully.");
}

main().catch(console.error);
