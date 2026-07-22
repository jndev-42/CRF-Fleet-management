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
            ('preview-user-tresorier',   'preview-tresorier@preview.local',   'Trésorier Preview', 1, '2026-07-10', 'System Preview'),
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
        { userId: 'preview-user-tresorier',  roles: 'TRESORIER' },
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

    // Migration des colonnes de signature et tampon si besoin
    const ulCols = await db.execute('PRAGMA table_info("UniteLocale")');
    const ulColNames = ulCols.rows.map(r => r.name as string);
    if (!ulColNames.includes('stampImage')) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "stampImage" TEXT`);
        console.log('    Migration : colonne UniteLocale.stampImage ajoutée');
    }

    const expCols = await db.execute('PRAGMA table_info("ExpenseReport")');
    const expColNames = expCols.rows.map(r => r.name as string);
    if (!expColNames.includes('userSignature')) {
        await db.execute(`ALTER TABLE "ExpenseReport" ADD COLUMN "userSignature" TEXT`);
    }
    if (!expColNames.includes('userFunction')) {
        await db.execute(`ALTER TABLE "ExpenseReport" ADD COLUMN "userFunction" TEXT`);
    }
    if (!expColNames.includes('validatorSignature')) {
        await db.execute(`ALTER TABLE "ExpenseReport" ADD COLUMN "validatorSignature" TEXT`);
    }

    // Seed sample ExpenseReports in preview database
    const now = new Date().toISOString();
    const demoUserSig = JSON.stringify({
        mode: 'typed',
        name: 'Chauffeur Preview',
        date: now,
        hash: 'ysg_20260721_demo_chvl',
        userEmail: 'preview-chvl@preview.local',
        functionTitle: 'Secouriste Bénévole'
    });
    const demoValSig = JSON.stringify({
        mode: 'typed',
        name: 'Président Preview',
        date: now,
        hash: 'ysg_20260721_demo_pres',
        userEmail: 'preview-president@preview.local',
        functionTitle: 'Président local'
    });

    await db.execute({
        sql: `INSERT OR REPLACE INTO "ExpenseReport"
            (id, userId, submittedAt, status, imputation, customImputation, requestRefund, noReceiptDeclaration, total, items, ulId, validatedAt, validatedBy, rejectionComment, rejectedAt, rejectedBy, paidAt, paidBy, userSignature, userFunction, validatorSignature, createdAt, updatedAt)
            VALUES
            ('preview-exp-pending-pay', 'preview-user-chvl', ?, 'en_attente_paiement', 'DLUS', NULL, 1, 0, 45.50, '[{"label":"Essence VPSP Boxer","amount":45.50}]', 'ul-paris-18', ?, 'preview-user-president', NULL, NULL, NULL, NULL, NULL, ?, 'Secouriste Bénévole', ?, ?, ?),
            ('preview-exp-submitted', 'preview-user-chvl', ?, 'soumis', 'UL', NULL, 1, 0, 28.00, '[{"label":"Piles et fourniture poste","amount":28.00}]', 'ul-paris-18', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 'Secouriste Bénévole', NULL, ?, ?),
            ('preview-exp-paid', 'preview-user-chvl', ?, 'traité', 'DLAS', NULL, 1, 0, 120.00, '[{"label":"Repas secours marathon","amount":120.00}]', 'ul-paris-18', ?, 'preview-user-president', NULL, NULL, NULL, ?, 'preview-user-tresorier', ?, 'Equipier Secouriste', ?, ?, ?),
            ('preview-exp-rejected', 'preview-user-chvl', ?, 'refusé', 'Autre', 'Projet Spécial', 1, 0, 89.90, '[{"label":"Matériel indéterminé","amount":89.90}]', 'ul-paris-18', NULL, NULL, 'Justificatif flou et il manque la facture acquittée.', ?, 'preview-user-president', NULL, NULL, ?, 'Equipier Secouriste', NULL, ?, ?)`,
        args: [
            now, now, demoUserSig, demoValSig, now, now,
            now, demoUserSig, now, now,
            now, now, now, demoUserSig, demoValSig, now, now,
            now, now, demoUserSig, now, now
        ]
    });
    console.log('✅ Sample Expense Reports seeded with signatures (including en_attente_paiement)');

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
