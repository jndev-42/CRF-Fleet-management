/**
 * Seed script for preview database.
 * Run with: npx tsx scripts/seed-preview-users.ts
 * Uses TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from environment.
 */

import { createClient } from '@libsql/client';

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL || '').trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function seed() {
    console.log('🔌 Connecting to:', process.env.TURSO_DATABASE_URL);

    // Insert preview users
    await db.execute({
        sql: `INSERT OR REPLACE INTO "User" (id, email, name, papiers_valides, last_validation, validated_by) VALUES
            ('preview-user-admin',       'preview-admin@preview.local',       'Admin Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-respo',       'preview-respo@preview.local',       'Responsable Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-chvl',        'preview-chvl@preview.local',        'Chauffeur Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-ci',          'preview-ci@preview.local',          'CI/RPAPS Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-secouriste',  'preview-secouriste@preview.local',  'Secouriste Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-inactif',     'preview-inactif@preview.local',     'Inactif Preview', 1, '2026-07-10', 'System Preview')`,
        args: [],
    });
    console.log('    Users inserted/updated with validated papers');

    // Check which UL IDs exist
    const uls = await db.execute(`SELECT id, name FROM "UniteLocale" LIMIT 10`);
    console.log('📋 Available ULs:', uls.rows.map(r => `${r.id} (${r.name})`).join(', ') || 'none');

    if (uls.rows.length === 0) {
        console.log('⚠️  No UL found — skipping UserUL inserts. Create an UL first.');
        return;
    }

    // Use the first available UL (prefer ul-paris-18 if it exists)
    const ulId = (uls.rows.find(r => r.id === 'ul-paris-18') ?? uls.rows[0]).id as string;
    console.log(`🏠 Using UL: ${ulId}`);

    // Insert UserUL relationships
    const userULs = [
        { userId: 'preview-user-admin',      roles: 'ADMIN,CHVL' },
        { userId: 'preview-user-respo',      roles: 'RESPO,CHVL' },
        { userId: 'preview-user-chvl',       roles: 'CHVL' },
        { userId: 'preview-user-ci',         roles: 'CI/RPAPS' },
        { userId: 'preview-user-secouriste', roles: '' },
        { userId: 'preview-user-inactif',    roles: 'INACTIF' },
    ];

    for (const entry of userULs) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, 1, ?)`,
            args: [entry.userId, ulId, entry.roles],
        });
    }
    console.log('✅ UserUL relationships inserted');

    // Verify
    const check = await db.execute({
        sql: `SELECT u.email, uu.roles FROM "User" u JOIN "UserUL" uu ON uu.userId = u.id WHERE u.email LIKE '%preview.local%'`,
        args: [],
    });
    console.log('\n📊 Preview users in DB:');
    for (const row of check.rows) {
        console.log(`  • ${row.email} → [${row.roles || 'no roles'}]`);
    }

    console.log('\n🎉 Seed complete!');
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
