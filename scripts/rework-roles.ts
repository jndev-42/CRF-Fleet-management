/**
 * Migration : Rework des rôles utilisateurs
 *
 * Ce script :
 * 1. Insère les nouveaux rôles : SUPER_ADMIN, PRESIDENT, CADRE
 * 2. Renomme ADMIN → SUPER_ADMIN dans UserRole et UserUL.roles
 * 3. Migre les RESPO existants → PRESIDENT
 * 4. Supprime les rôles RESPO, SECOURISTE, GUEST de la table Role
 *
 * ⚠️ À exécuter une seule fois en production.
 * Commande : npx tsx scripts/rework-roles.ts
 */

import { createClient } from '@libsql/client';
import crypto from 'crypto';
import "dotenv/config";

async function main() {
    console.log("=== Rework des rôles : début de la migration ===\n");

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
        // ── 1. Récupérer les IDs actuels des rôles ──────────────────────────────
        console.log("1. Récupération des rôles existants...");
        const existingRoles = await db.execute(`SELECT id, name FROM "Role"`);
        const roleIdByName: Record<string, string> = {};
        for (const row of existingRoles.rows) {
            roleIdByName[row.name as string] = row.id as string;
        }
        console.log("   Rôles existants :", Object.keys(roleIdByName).join(', '));

        // ── 2. Insérer les nouveaux rôles (SUPER_ADMIN, PRESIDENT, CADRE) ───────
        console.log("\n2. Insertion des nouveaux rôles...");
        const newRoles = ['SUPER_ADMIN', 'PRESIDENT', 'CADRE'];
        for (const roleName of newRoles) {
            if (!roleIdByName[roleName]) {
                const newId = crypto.randomUUID();
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
                    args: [newId, roleName]
                });
                roleIdByName[roleName] = newId;
                console.log(`   ✅ Inséré : ${roleName} (id=${newId})`);
            } else {
                console.log(`   ⏭️ Déjà existant : ${roleName}`);
            }
        }

        // Recharger les IDs après insertion (au cas où il y avait déjà des conflits)
        const freshRoles = await db.execute(`SELECT id, name FROM "Role"`);
        for (const row of freshRoles.rows) {
            roleIdByName[row.name as string] = row.id as string;
        }

        // ── 3. Migrer UserRole : ADMIN → SUPER_ADMIN ────────────────────────────
        console.log("\n3. Migration UserRole : ADMIN → SUPER_ADMIN...");
        const oldAdminRoleId = roleIdByName['ADMIN'];
        const newSuperAdminRoleId = roleIdByName['SUPER_ADMIN'];

        if (oldAdminRoleId && newSuperAdminRoleId) {
            // Trouver tous les users ayant le rôle ADMIN
            const adminUsers = await db.execute({
                sql: `SELECT userId FROM "UserRole" WHERE roleId = ?`,
                args: [oldAdminRoleId]
            });
            console.log(`   Trouvé ${adminUsers.rows.length} utilisateur(s) avec le rôle ADMIN`);

            for (const row of adminUsers.rows) {
                const userId = row.userId as string;
                // Insérer SUPER_ADMIN
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [userId, newSuperAdminRoleId]
                });
                console.log(`   ✅ UserId ${userId} : ADMIN → SUPER_ADMIN`);
            }

            // Supprimer les entrées ADMIN de UserRole
            await db.execute({
                sql: `DELETE FROM "UserRole" WHERE roleId = ?`,
                args: [oldAdminRoleId]
            });
            console.log(`   🗑️ Suppression des lignes UserRole ADMIN`);
        } else {
            console.log("   ⚠️ Rôle ADMIN ou SUPER_ADMIN introuvable, étape ignorée");
        }

        // ── 4. Migrer UserRole : RESPO → CADRE ──────────────────────────────────
        console.log("\n4. Migration UserRole : RESPO → CADRE...");
        const oldRespoRoleId = roleIdByName['RESPO'];
        const newCadreRoleId = roleIdByName['CADRE'];

        if (oldRespoRoleId && newCadreRoleId) {
            const respoUsers = await db.execute({
                sql: `SELECT userId FROM "UserRole" WHERE roleId = ?`,
                args: [oldRespoRoleId]
            });
            console.log(`   Trouvé ${respoUsers.rows.length} utilisateur(s) avec le rôle RESPO`);

            for (const row of respoUsers.rows) {
                const userId = row.userId as string;
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [userId, newCadreRoleId]
                });
                console.log(`   ✅ UserId ${userId} : RESPO → CADRE`);
            }

            await db.execute({
                sql: `DELETE FROM "UserRole" WHERE roleId = ?`,
                args: [oldRespoRoleId]
            });
            console.log(`   🗑️ Suppression des lignes UserRole RESPO`);
        } else {
            console.log("   ⚠️ Rôle RESPO ou CADRE introuvable, étape ignorée");
        }

        // ── 5. Migrer UserUL.roles : ADMIN → SUPER_ADMIN, RESPO → CADRE ─────────
        console.log("\n5. Migration UserUL.roles (texte CSV)...");
        const allUserULs = await db.execute(`SELECT userId, ulId, roles FROM "UserUL" WHERE roles IS NOT NULL AND roles != ''`);
        console.log(`   Trouvé ${allUserULs.rows.length} entrées UserUL à vérifier`);

        for (const row of allUserULs.rows) {
            const currentRoles = (row.roles as string);
            const updatedRoles = currentRoles
                .split(',')
                .map(r => r.trim())
                .map(r => {
                    if (r === 'ADMIN') return 'SUPER_ADMIN';
                    if (r === 'RESPO') return 'CADRE';
                    if (r === 'GUEST') return 'INACTIF';
                    return r;
                })
                .join(',');

            if (updatedRoles !== currentRoles) {
                await db.execute({
                    sql: `UPDATE "UserUL" SET roles = ? WHERE userId = ? AND ulId = ?`,
                    args: [updatedRoles, row.userId as string, row.ulId as string]
                });
                console.log(`   ✅ UserUL ${row.userId}/${row.ulId} : "${currentRoles}" → "${updatedRoles}"`);
            }
        }

        // ── 6. Migrer UserRole : GUEST → INACTIF ────────────────────────────────
        console.log("\n6. Migration UserRole : GUEST → INACTIF...");
        const guestRoleId = roleIdByName['GUEST'];
        const inactifRoleId = roleIdByName['INACTIF'];

        if (guestRoleId && inactifRoleId) {
            const guestUsers = await db.execute({
                sql: `SELECT userId FROM "UserRole" WHERE roleId = ?`,
                args: [guestRoleId]
            });
            console.log(`   Trouvé ${guestUsers.rows.length} utilisateur(s) avec le rôle GUEST`);

            for (const row of guestUsers.rows) {
                const userId = row.userId as string;
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [userId, inactifRoleId]
                });
            }

            await db.execute({
                sql: `DELETE FROM "UserRole" WHERE roleId = ?`,
                args: [guestRoleId]
            });
            console.log(`   🗑️ Suppression des lignes UserRole GUEST`);
        } else {
            console.log("   ⏭️ Rôle GUEST non trouvé (déjà migré ?), étape ignorée");
        }

        // ── 7. Supprimer les anciens rôles de la table Role ─────────────────────
        console.log("\n7. Suppression des anciens rôles (RESPO, ADMIN, GUEST, SECOURISTE)...");
        const rolesToDelete = ['RESPO', 'ADMIN', 'GUEST', 'SECOURISTE'];
        for (const roleName of rolesToDelete) {
            const roleId = roleIdByName[roleName];
            if (roleId) {
                // Vérifier qu'il n'y a plus de références dans UserRole
                const remaining = await db.execute({
                    sql: `SELECT COUNT(*) as cnt FROM "UserRole" WHERE roleId = ?`,
                    args: [roleId]
                });
                const count = remaining.rows[0].cnt as number;
                if (count === 0) {
                    await db.execute({
                        sql: `DELETE FROM "Role" WHERE id = ?`,
                        args: [roleId]
                    });
                    console.log(`   🗑️ Rôle "${roleName}" supprimé de la table Role`);
                } else {
                    console.log(`   ⚠️ Rôle "${roleName}" a encore ${count} référence(s) dans UserRole — NON supprimé`);
                }
            } else {
                console.log(`   ⏭️ Rôle "${roleName}" introuvable, ignoré`);
            }
        }

        // ── 8. Résumé final ──────────────────────────────────────────────────────
        console.log("\n8. Résumé des rôles après migration :");
        const finalRoles = await db.execute(`SELECT name FROM "Role" ORDER BY name`);
        for (const row of finalRoles.rows) {
            const countRes = await db.execute({
                sql: `SELECT COUNT(DISTINCT ur.userId) as cnt FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id WHERE r.name = ?`,
                args: [row.name as string]
            });
            console.log(`   ${row.name} : ${countRes.rows[0].cnt} utilisateur(s)`);
        }

        console.log("\n=== Migration terminée avec succès ✅ ===");

    } catch (error) {
        console.error("\n❌ Migration échouée :", error);
        process.exit(1);
    }
}

main().catch(console.error);
