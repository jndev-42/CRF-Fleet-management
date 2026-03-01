import { createClient } from '@libsql/client';
import crypto from 'crypto';
import "dotenv/config";

async function main() {
    console.log("Starting DB migration for roles...");
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        // Create Role table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "Role" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE
            )
        `);
        console.log("Created Role table");

        // Seed Roles
        const roles = ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'GUEST'];
        const roleIds: Record<string, string> = {};
        for (const role of roles) {
            const roleId = crypto.randomUUID();
            roleIds[role] = roleId;
            try {
                // If it exists, we catch the unique constraint error or use INSERT OR IGNORE
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
                    args: [roleId, role]
                });
            } catch (e) {
                console.log(`Role ${role} might already exist`);
            }
        }

        // Retrieve actual role IDs just in case they were already seeded
        const roleRows = await db.execute(`SELECT id, name FROM "Role"`);
        roleRows.rows.forEach(r => {
            roleIds[r.name as string] = r.id as string;
        });
        console.log("Seeded Roles", Object.keys(roleIds));

        // Create User table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "User" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "email" TEXT NOT NULL UNIQUE,
                "name" TEXT,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Created User table");

        // Create UserRole table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS "UserRole" (
                "userId" TEXT NOT NULL,
                "roleId" TEXT NOT NULL,
                PRIMARY KEY ("userId", "roleId"),
                CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
        `);
        console.log("Created UserRole table");

        // Migrate Admin to User and UserRole
        console.log("Migrating Admin table...");
        let adminUsers;
        try {
            adminUsers = await db.execute(`SELECT email FROM "Admin"`);
            console.log(`Found ${adminUsers.rows.length} admins to migrate.`);
        } catch (e) {
            console.log("Admin table not found or error:", e);
            adminUsers = { rows: [] };
        }

        const adminRoleId = roleIds['ADMIN'];

        for (const row of adminUsers.rows) {
            const email = row.email as string;
            let userId: string = crypto.randomUUID();

            // Check if user already exists
            const existingUser = await db.execute({
                sql: `SELECT id FROM "User" WHERE email = ?`,
                args: [email]
            });

            if (existingUser.rows.length > 0) {
                userId = existingUser.rows[0].id as string;
            } else {
                await db.execute({
                    sql: `INSERT INTO "User" (id, email) VALUES (?, ?)`,
                    args: [userId, email]
                });
            }

            // Assign ADMIN role
            await db.execute({
                sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                args: [userId, adminRoleId]
            });
            console.log(`Migrated admin: ${email}`);
        }

        // Drop the Admin table
        try {
            await db.execute(`DROP TABLE "Admin"`);
            console.log("Dropped Admin table.");
        } catch (e) {
            console.log("Could not drop Admin table. Maybe it doesn't exist.");
        }

        console.log("Migration finished successfully.");

    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main().catch(console.error);
