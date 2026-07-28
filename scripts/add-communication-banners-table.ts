import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for CommunicationBanner...");
    const url = process.env.DEV_DB_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:./dev.db';
    const authToken = process.env.DEV_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

    const db = createClient({
        url,
        authToken
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "CommunicationBanner" (
                "id"              TEXT NOT NULL PRIMARY KEY,
                "title"           TEXT,
                "message"         TEXT NOT NULL,
                "target_page"     TEXT NOT NULL DEFAULT 'ALL',
                "type"            TEXT NOT NULL DEFAULT 'info',
                "ul_id"           TEXT REFERENCES "UniteLocale"("id") ON DELETE CASCADE,
                "is_global"       INTEGER NOT NULL DEFAULT 0,
                "is_active"       INTEGER NOT NULL DEFAULT 1,
                "created_by"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
                "created_by_name" TEXT,
                "created_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Created CommunicationBanner table successfully.");

        await db.execute(`
            CREATE INDEX IF NOT EXISTS "CommunicationBanner_active_ul_idx"
            ON "CommunicationBanner"("is_active", "ul_id", "is_global")
        `);
        console.log("Created index for CommunicationBanner table.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
