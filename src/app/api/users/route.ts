import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

/** Zod schema for creating a new user */
const createUserSchema = z.object({
    email: z.string().email('Email invalide'),
    name: z.string().min(1, 'Le nom est requis').max(100),
    roles: z.array(z.string()).optional().default([]),
});

/** GET /api/users — Admin: list all users with their roles */
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

/** POST /api/users — Admin: create a new user with optional initial roles */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json();

        let data: z.infer<typeof createUserSchema>;
        try {
            data = createUserSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        // Check uniqueness
        const existing = await db.execute({
            sql: 'SELECT id FROM "User" WHERE email = ?',
            args: [data.email]
        });
        if (existing.rows.length > 0) {
            return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà.' }, { status: 409 });
        }

        const userId = crypto.randomUUID();
        const now = new Date().toISOString();

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: 'INSERT INTO "User" (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                args: [userId, data.email, data.name, now, now]
            });

            // Assign initial roles
            for (const roleName of data.roles) {
                const roleRes = await tx.execute({
                    sql: 'SELECT id FROM "Role" WHERE name = ?',
                    args: [roleName]
                });
                if (roleRes.rows.length > 0) {
                    await tx.execute({
                        sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                        args: [userId, roleRes.rows[0].id]
                    });
                }
            }

            await tx.commit();
            return NextResponse.json({ success: true, id: userId }, { status: 201 });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Erreur lors de la création de l\'utilisateur' }, { status: 500 });
    }
}
