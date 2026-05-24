import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkRoleOrForbidden, checkAdminOrForbidden } from '@/lib/utils/auth-server';
import { ROLES, DRIVER_ROLES, ADMIN_OR_RESPO_ROLES } from '@/lib/constants/roles';

function resolveRoles(roles: string[]): string[] {
    // 'INACTIF' is the current inactive role; 'GUEST' is the legacy alias (DB backfill pending)
    const isInactiveRole = (r: string) => r === ROLES.INACTIF || r === ROLES.GUEST;
    const activeRoles = roles.filter(r => !isInactiveRole(r));
    if (activeRoles.length === 0) {
        // Preserve whatever inactive role was passed (GUEST or INACTIF) — DB backfill handles normalization
        const inactiveRole = roles.find(isInactiveRole);
        return inactiveRole ? [inactiveRole] : [];
    }
    return activeRoles;
}

/** Zod schema for creating a new user */
const createUserSchema = z.object({
    email: z.string().email('Email invalide'),
    name: z.string().min(1, 'Le nom est requis').max(100),
    roles: z.array(z.string()).optional().default([]),
});

/** GET /api/users — ADMIN ou RESPO : liste tous les utilisateurs avec leurs rôles.
 *  ?drivers=true  → retourne uniquement les utilisateurs ayant le rôle CHVL ou CHVPSP */
export async function GET(request: Request) {
    try {
        const { response: forbiddenResponse } = await checkRoleOrForbidden(ADMIN_OR_RESPO_ROLES);
        if (forbiddenResponse) return forbiddenResponse;

        const { searchParams } = new URL(request.url);
        const driversOnly = searchParams.get('drivers') === 'true';
        const vehicleType = searchParams.get('vehicleType')?.toUpperCase();

        let roleFilter: string[] | null = null;
        if (vehicleType === 'VPSP') roleFilter = [ROLES.CHVPSP];
        else if (vehicleType === 'VL') roleFilter = [ROLES.CHVL];
        else if (driversOnly) roleFilter = DRIVER_ROLES;

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
                            GROUP_CONCAT(r.name) as roles
                        FROM "User" u
                        LEFT JOIN "UserRole" ur ON u.id = ur.userId
                        LEFT JOIN "Role" r ON ur.roleId = r.id
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
                        GROUP_CONCAT(r.name) as roles
                    FROM "User" u
                    LEFT JOIN "UserRole" ur ON u.id = ur.userId
                    LEFT JOIN "Role" r ON ur.roleId = r.id
                    GROUP BY u.id
                    ORDER BY u.email ASC
                `
        );

        const rolesRes = await db.execute(`SELECT name FROM "Role"`);
        const availableRoles = rolesRes.rows.map(r => r.name);

        const users = usersRes.rows.map(row => ({
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: row.createdAt,
            papiers_valides: row.papiers_valides !== null ? Number(row.papiers_valides) : 1,
            last_validation: row.last_validation ?? null,
            start_date_invalidation_process: row.start_date_invalidation_process ?? null,
            validated_by: row.validated_by ?? null,
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
        const { response: forbiddenResponse } = await checkAdminOrForbidden();
        if (forbiddenResponse) return forbiddenResponse;

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

            // Si l'utilisateur est créé avec un rôle CHVL ou CHVPSP,
            // invalider les papiers par défaut.
            const isDriver = resolvedRoles.some(r => DRIVER_ROLES.includes(r));
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
