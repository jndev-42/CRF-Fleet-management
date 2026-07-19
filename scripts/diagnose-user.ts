/**
 * Diagnostic : vérifier les rôles de jeannoel.durand@croix-rouge.fr en production
 */

import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const email = 'jeannoel.durand@croix-rouge.fr';
    console.log(`\n=== Diagnostic des rôles pour ${email} ===\n`);

    // 1. Trouver l'utilisateur
    const userRes = await db.execute({
        sql: `SELECT id, email FROM "User" WHERE email = ?`,
        args: [email]
    });
    if (userRes.rows.length === 0) {
        console.log('❌ Utilisateur non trouvé !');
        return;
    }
    const userId = userRes.rows[0].id as string;
    console.log(`✅ User trouvé : id=${userId}`);

    // 2. Rôles globaux (UserRole)
    const globalRoles = await db.execute({
        sql: `SELECT r.name FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id WHERE ur.userId = ?`,
        args: [userId]
    });
    console.log(`\n📋 Rôles globaux (UserRole) :`);
    if (globalRoles.rows.length === 0) {
        console.log('   ⚠️ AUCUN rôle global !');
    } else {
        for (const row of globalRoles.rows) {
            console.log(`   - ${row.name}`);
        }
    }

    // 3. Rôles par UL (UserUL)
    const ulRoles = await db.execute({
        sql: `SELECT uu.ulId, ul.name as ulName, uu.roles FROM "UserUL" uu JOIN "UL" ul ON uu.ulId = ul.id WHERE uu.userId = ?`,
        args: [userId]
    });
    console.log(`\n🏛️ Rôles par UL (UserUL) :`);
    if (ulRoles.rows.length === 0) {
        console.log('   ⚠️ Aucune entrée UserUL !');
    } else {
        for (const row of ulRoles.rows) {
            console.log(`   - UL "${row.ulName}" (${row.ulId}) : "${row.roles}"`);
        }
    }

    // 4. Tous les rôles disponibles dans Role
    const allRoles = await db.execute(`SELECT name FROM "Role" ORDER BY name`);
    console.log(`\n🎭 Tous les rôles dans la table Role :`);
    for (const row of allRoles.rows) {
        console.log(`   - ${row.name}`);
    }

    console.log('\n=== Fin du diagnostic ===\n');
}

main().catch(console.error);
