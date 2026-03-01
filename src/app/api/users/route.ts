import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const usersRes = await db.execute(`
            SELECT 
                u.id, 
                u.email, 
                u.name, 
                u.createdAt,
                GROUP_CONCAT(r.name) as roles
            FROM "User" u
            LEFT JOIN "UserRole" ur ON u.id = ur.userId
            LEFT JOIN "Role" r ON ur.roleId = r.id
            GROUP BY u.id
            ORDER BY u.email ASC
        `);

        // Get all available roles
        const rolesRes = await db.execute(`SELECT name FROM "Role"`);
        const availableRoles = rolesRes.rows.map(r => r.name);

        const users = usersRes.rows.map(row => ({
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.createdAt,
            roles: row.roles ? (row.roles as string).split(',') : []
        }));

        return NextResponse.json({ users, availableRoles });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des utilisateurs' },
            { status: 500 }
        );
    }
}
