import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';
import crypto from 'crypto';
import "dotenv/config";

// Helper to format string: remove accents, spaces, hyphens and convert to lowercase
function formatIdentifier(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[-\s]/g, "")          // remove hyphens and spaces
        .toLowerCase();
}

/** 
 * Format display name: 
 * - First Name: Title Cased (handles hyphens and spaces, e.g., "Jean-Noël")
 * - Last Name: ALL CAPS (e.g., "DURAND")
 */
function formatDisplayName(firstName: string, lastName: string): string {
    const upperLastName = lastName.toUpperCase();

    // Split by both hyphen and space to title-case each part
    const titleFirstName = firstName.toLowerCase().split(/([- ])/).map(part => {
        if (part === '-' || part === ' ') return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');

    return `${titleFirstName} ${upperLastName}`;
}

async function main() {
    console.log("Starting users import...");

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL || 'libsql://dummy',
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    // 1. Fetch available roles
    const rolesRes = await db.execute(`SELECT id, name FROM "Role"`);
    const roleIds: Record<string, string> = {};
    rolesRes.rows.forEach(r => {
        roleIds[r.name as string] = r.id as string;
    });

    console.log("Available roles in DB:", Object.keys(roleIds));

    // 2. Read and parse CSV
    const csvPath = path.join(process.cwd(), 'users.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');

    // Skip header line
    const dataLines = lines.slice(1);

    // Group users by email
    const usersMap = new Map<string, { firstName: string, lastName: string, name: string, roles: Set<string> }>();

    for (const line of dataLines) {
        const parts = line.split(';');
        if (parts.length < 7) continue;

        const lastNameRaw = parts[0].trim();
        const firstNameRaw = parts[1].trim();
        const aptitude = parts[6].trim();

        if (!lastNameRaw || !firstNameRaw) continue;

        const formattedFirst = formatIdentifier(firstNameRaw).toLowerCase();
        const formattedLast = formatIdentifier(lastNameRaw).toLowerCase();

        const email = `${formattedFirst}.${formattedLast}@croix-rouge.fr`;
        const name = formatDisplayName(firstNameRaw, lastNameRaw);

        // Determine Role
        let role = '';
        if (aptitude === 'Conducteur VL (C_VL)') {
            role = 'CHVL';
        } else if (aptitude === 'Conducteur VPSP (C_VPSP)') {
            role = 'CHVPSP';
        }

        if (!usersMap.has(email)) {
            usersMap.set(email, {
                firstName: firstNameRaw,
                lastName: lastNameRaw,
                name,
                roles: new Set<string>()
            });
        }

        if (role) {
            usersMap.get(email)!.roles.add(role);
        }
    }

    console.log(`Parsed ${usersMap.size} unique users from CSV.`);

    let importedCount = 0;
    let skippedCount = 0;

    // 3. Process each user
    for (const [email, userData] of usersMap.entries()) {
        const { name, roles } = userData;

        // Check if user exists in DB
        const existingUser = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [email]
        });

        if (existingUser.rows.length > 0) {
            // Update the name if the user already exists so we apply the new formatting
            await db.execute({
                sql: `UPDATE "User" SET name = ? WHERE email = ?`,
                args: [name, email]
            });
            console.log(`Updated name for ${email} (already in database).`);
            skippedCount++;
            continue;
        }

        // Generate new ID and insert
        const userId = crypto.randomUUID();
        await db.execute({
            sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
            args: [userId, email, name]
        });

        // Insert roles
        for (const roleName of roles) {
            const roleId = roleIds[roleName];
            if (roleId) {
                await db.execute({
                    sql: `INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [userId, roleId]
                });
            } else {
                console.warn(`Role ${roleName} not found in DB for user ${email}`);
            }
        }

        console.log(`Imported ${email} with roles: ${Array.from(roles).join(', ')}`);
        importedCount++;
    }

    console.log(`\nImport complete!`);
    console.log(`Successfully imported: ${importedCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log(`Total processed: ${usersMap.size}`);
}

main().catch(console.error);
