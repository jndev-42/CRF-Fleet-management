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

    // Ensure UL Paris 18 exists in the database
    await db.execute({
        sql: `INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18ème', 'paris-18')`,
        args: []
    });
    console.log('    UL Paris 18 ensured');

    // Clean up legacy preview users
    const legacyUserIds = ['preview-user-respo', 'preview-user-secouriste'];
    for (const legacyId of legacyUserIds) {
        await db.execute({ sql: `DELETE FROM "UserRole" WHERE userId = ?`, args: [legacyId] });
        await db.execute({ sql: `DELETE FROM "UserUL" WHERE userId = ?`, args: [legacyId] });
        await db.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [legacyId] });
    }
    console.log('    Legacy preview users cleaned up');

    // Insert preview users
    await db.execute({
        sql: `INSERT OR REPLACE INTO "User" (id, email, name, papiers_valides, last_validation, validated_by) VALUES
            ('preview-user-superadmin',  'preview-superadmin@preview.local',  'Super Admin Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-admin',       'preview-admin@preview.local',       'Admin Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-president',   'preview-president@preview.local',   'Président Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-cadre',       'preview-cadre@preview.local',       'Cadre Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-chvl',        'preview-chvl@preview.local',        'Chauffeur Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-ci',          'preview-ci@preview.local',          'CI/RPAPS Preview', 1, '2026-07-10', 'System Preview'),
            ('preview-user-inactif',     'preview-inactif@preview.local',     'Inactif Preview', 1, '2026-07-10', 'System Preview')`,
        args: [],
    });
    console.log('    Users inserted/updated with validated papers');

    // Use ul-paris-18
    const ulId = 'ul-paris-18';
    console.log(`🏠 Using UL: ${ulId}`);

    // Insert UserUL relationships
    const userULs = [
        { userId: 'preview-user-superadmin', roles: 'SUPER_ADMIN,CHVL' },
        { userId: 'preview-user-admin',      roles: 'ADMIN,CHVL' },
        { userId: 'preview-user-president',  roles: 'PRESIDENT,CHVL' },
        { userId: 'preview-user-cadre',      roles: 'CADRE,CHVL' },
        { userId: 'preview-user-chvl',       roles: 'CHVL' },
        { userId: 'preview-user-ci',         roles: 'CI/RPAPS' },
        { userId: 'preview-user-inactif',    roles: 'INACTIF' },
    ];

    for (const entry of userULs) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, 1, ?)`,
            args: [entry.userId, ulId, entry.roles],
        });

        // Also seed global UserRole table for roles resolution fallback
        const rolesList = entry.roles.split(',').filter(Boolean);
        for (const roleName of rolesList) {
            // Find role ID
            const roleRes = await db.execute({
                sql: 'SELECT id FROM "Role" WHERE name = ?',
                args: [roleName]
            });
            if (roleRes.rows.length > 0) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [entry.userId, roleRes.rows[0].id]
                });
            }
        }
    }
    console.log('✅ UserUL and global UserRole relationships inserted');

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
