import { createClient } from '@libsql/client';
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL || 'file:./dev.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function run() {
    console.log('▶ Starting UL schema initialization and migration...');

    // 1. Create UniteLocale table if not exists
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UniteLocale" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL UNIQUE,
            "slug" TEXT NOT NULL UNIQUE,
            "phoneNumbers" TEXT,
            "defaultParkingSpots" TEXT
        )
    `);
    console.log('  ✓ Table "UniteLocale" verified/created');

    // 2. Create UserUL table if not exists
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UserUL" (
            "userId" TEXT NOT NULL,
            "ulId" TEXT NOT NULL,
            "is_home" INTEGER NOT NULL DEFAULT 0,
            "roles" TEXT,
            PRIMARY KEY ("userId", "ulId"),
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
            FOREIGN KEY ("ulId") REFERENCES "UniteLocale"("id") ON DELETE CASCADE
        )
    `);
    console.log('  ✓ Table "UserUL" verified/created');

    // 3. Add phoneNumbers and defaultParkingSpots columns to UniteLocale if missing
    const tableInfo = await db.execute(`PRAGMA table_info("UniteLocale")`);
    if (!tableInfo.rows.some(r => r.name === 'phoneNumbers')) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "phoneNumbers" TEXT`);
        console.log('  ✓ Column "phoneNumbers" added to "UniteLocale"');
    }
    if (!tableInfo.rows.some(r => r.name === 'defaultParkingSpots')) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "defaultParkingSpots" TEXT`);
        console.log('  ✓ Column "defaultParkingSpots" added to "UniteLocale"');
    }

    // 4. Seed Paris 18 UL with default phone numbers and default parking spots
    const p18PhoneNumbers = JSON.stringify([
        { label: 'DLUS', number: '06 20 13 93 64' },
        { label: 'DLUSA', number: '06 05 49 99 67' },
        { label: 'MOT', number: '06 16 08 19 06' }
    ]);
    const p18ParkingSpots = JSON.stringify([
        "Baigneur (devant l'UL)",
        "Parking Aubervilliers"
    ]);

    await db.execute({
        sql: `INSERT OR IGNORE INTO "UniteLocale" (id, name, slug, phoneNumbers, defaultParkingSpots) VALUES (?, ?, ?, ?, ?)`,
        args: ['ul-paris-18', 'Paris 18', 'paris-18', p18PhoneNumbers, p18ParkingSpots]
    });
    await db.execute({
        sql: `UPDATE "UniteLocale" SET defaultParkingSpots = ? WHERE id = 'ul-paris-18' AND (defaultParkingSpots IS NULL OR defaultParkingSpots = '')`,
        args: [p18ParkingSpots]
    });
    console.log('  ✓ Seeded Paris 18 (ul-paris-18) in UniteLocale');

    // 5. Backfill dev users to Paris 18 if they exist in User table
    const devEmails = [
        { email: 'admin@dev.local', roles: 'ADMIN,CHVL' },
        { email: 'respo@dev.local', roles: 'RESPO,CHVL' },
        { email: 'chvl@dev.local', roles: 'CHVL' },
        { email: 'guest@dev.local', roles: 'INACTIF' },
        { email: 'secouriste@dev.local', roles: 'SECOURISTE' },
        { email: 'jeannoel.durand@croix-rouge.fr', roles: 'ADMIN,CHVL' }
    ];

    for (const dev of devEmails) {
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [dev.email]
        });
        if (userRes.rows.length > 0) {
            const userId = userRes.rows[0].id as string;
            await db.execute({
                sql: `INSERT OR IGNORE INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, 'ul-paris-18', 1, ?)`,
                args: [userId, dev.roles]
            });
            console.log(`  ✓ Associated dev user ${dev.email} with ul-paris-18 (home=1, roles=${dev.roles})`);
        }
    }

    console.log('✅ UL schema migration completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
