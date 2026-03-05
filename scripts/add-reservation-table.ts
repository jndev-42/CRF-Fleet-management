import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for Reservations...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "Reservation" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "vehicleId" TEXT NOT NULL,
                "userEmail" TEXT NOT NULL,
                "userName" TEXT NOT NULL,
                "startTime" DATETIME NOT NULL,
                "endTime" DATETIME NOT NULL,
                "reason" TEXT,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Reservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
        `);
        console.log("Created Reservation table successfully.");

        await db.execute(`
            CREATE INDEX IF NOT EXISTS "Reservation_vehicleId_startTime_idx" ON "Reservation"("vehicleId", "startTime")
        `);
        console.log("Created index for Reservation table.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
