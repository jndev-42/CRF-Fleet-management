import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove, canAccessAdminPanel, resolveRoles, isSuperAdmin } from '@/lib/roles';

/** Zod schema for creating a new user */
const createUserSchema = z.object({
    email: z.string().email('Email invalide'),
    name: z.string().min(1, 'Le nom est requis').max(100),
    roles: z.array(z.string()).optional().default([]),
    ulId: z.string().optional().nullable(),
});

/** GET /api/users — ADMIN ou RESPO : liste tous les utilisateurs avec leurs rôles.
 *  ?drivers=true  → retourne uniquement les utilisateurs ayant le rôle CHVL ou CHVPSP */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const roles = session.user.roles || [];
        const canView = canAccessAdminPanel(roles);
        if (!canView) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const driversOnly = searchParams.get('drivers') === 'true';
        const vehicleType = searchParams.get('vehicleType')?.toUpperCase();

        let roleFilter: string[] | null = null;
        if (vehicleType === 'VPSP') roleFilter = ['CHVPSP'];
        else if (vehicleType === 'VL') roleFilter = ['CHVL'];
        else if (driversOnly) roleFilter = ['CHVL', 'CHVPSP'];

        const usersRes = await db.execute(
            roleFilter
                ? {
                    sql: `
                        SELECT
                            u.id,
                            u.email,
                            u.name,
                            u.createdAt,
                            u.papiers_valides,
                            u.last_validation,
                            u.start_date_invalidation_process,
                            u.validated_by,
                            GROUP_CONCAT(r.name) as roles,
                            home_ul.ulId as homeUlId,
                            home_ul_info.name as homeUlName
                        FROM "User" u
                        LEFT JOIN "UserRole" ur ON u.id = ur.userId
                        LEFT JOIN "Role" r ON ur.roleId = r.id
                        LEFT JOIN "UserUL" home_ul ON u.id = home_ul.userId AND home_ul.is_home = 1
                        LEFT JOIN "UniteLocale" home_ul_info ON home_ul.ulId = home_ul_info.id
                        WHERE u.id IN (
                            SELECT DISTINCT ur2.userId
                            FROM "UserRole" ur2
                            JOIN "Role" r2 ON ur2.roleId = r2.id
                            WHERE r2.name IN (${roleFilter.map(() => '?').join(', ')})
                        )
                        GROUP BY u.id
                        ORDER BY u.email ASC
                    `,
                    args: roleFilter,
                }
                : `
                    SELECT
                        u.id,
                        u.email,
                        u.name,
                        u.createdAt,
                        u.papiers_valides,
                        u.last_validation,
                        u.start_date_invalidation_process,
                        u.validated_by,
                        GROUP_CONCAT(r.name) as roles,
                        home_ul.ulId as homeUlId,
                        home_ul_info.name as homeUlName
                    FROM "User" u
                    LEFT JOIN "UserRole" ur ON u.id = ur.userId
                    LEFT JOIN "Role" r ON ur.roleId = r.id
                    LEFT JOIN "UserUL" home_ul ON u.id = home_ul.userId AND home_ul.is_home = 1
                    LEFT JOIN "UniteLocale" home_ul_info ON home_ul.ulId = home_ul_info.id
                    GROUP BY u.id
                    ORDER BY u.email ASC
                `
        );

        const rolesRes = await db.execute(`SELECT name FROM "Role"`);
        const isSuper = isSuperAdmin(roles);
        const availableRoles = rolesRes.rows
            .map(r => r.name as string)
            .filter(roleName => isSuper || roleName !== 'SUPER_ADMIN');

        const users = usersRes.rows.map(row => ({
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.createdAt,
            papiers_valides: row.papiers_valides !== null ? Number(row.papiers_valides) : 1,
            last_validation: row.last_validation ?? null,
            start_date_invalidation_process: row.start_date_invalidation_process ?? null,
            validated_by: row.validated_by ?? null,
            roles: row.roles ? (row.roles as string).split(',') : [],
            homeUlId: row.homeUlId ?? null,
            homeUlName: row.homeUlName ?? null,
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
        const roles = session?.user?.roles || [];
        if (!isAdminOrAbove(roles)) {
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

        const isSuper = isSuperAdmin(roles);
        if (!isSuper) {
            if (data.ulId !== session?.user?.ulId) {
                return NextResponse.json({ error: 'Un administrateur local ne peut créer un utilisateur que pour sa propre Unité Locale.' }, { status: 403 });
            }
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
        let ulName: string | null = null;

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: 'INSERT INTO "User" (id, email, name, createdAt) VALUES (?, ?, ?, ?)',
                args: [userId, data.email, data.name, now]
            });

            // Assign initial roles
            const resolvedRoles = resolveRoles(data.roles);
            for (const roleName of resolvedRoles) {
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

            // Assign UL
            if (data.ulId) {
                const ulRes = await tx.execute({
                    sql: 'SELECT name FROM "UniteLocale" WHERE id = ?',
                    args: [data.ulId]
                });
                if (ulRes.rows.length > 0) {
                    ulName = ulRes.rows[0].name as string;
                    await tx.execute({
                        sql: 'INSERT INTO "UserUL" (userId, ulId, is_home) VALUES (?, ?, 1)',
                        args: [userId, data.ulId]
                    });
                }
            }

            // Si l'utilisateur est créé avec un rôle CHVL ou CHVPSP,
            // invalider les papiers par défaut.
            const isDriver = resolvedRoles.some(r => r === 'CHVL' || r === 'CHVPSP');
            if (isDriver) {
                const today = new Date().toISOString().slice(0, 10);
                await tx.execute({
                    sql: `UPDATE "User"
                          SET papiers_valides = 0,
                               start_date_invalidation_process = ?
                          WHERE id = ?`,
                    args: [today, userId],
                });
            }

            await tx.commit();
            return NextResponse.json({ success: true, id: userId, ulName }, { status: 201 });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Erreur lors de la création de l\'utilisateur' }, { status: 500 });
    }
}
