import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for Notifications...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "Notification" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "userId" TEXT NOT NULL,
                "title" TEXT NOT NULL,
                "message" TEXT NOT NULL,
                "url" TEXT,
                "isRead" BOOLEAN NOT NULL DEFAULT false,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
        `);
        console.log("Created Notification table successfully.");

        // Create an index for faster lookups by user and read status
        await db.execute(`
            CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")
        `);
        console.log("Created index for Notification table.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
