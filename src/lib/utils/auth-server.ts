import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { ROLES } from '@/lib/constants/roles';

export async function getSessionOrUnauthorized() {
    const session = await auth();
    if (!session?.user) {
        return { session: null, response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
    }
    return { session, response: null };
}

export function hasRole(session: any, roles: string | string[]) {
    const userRoles = (session?.user?.roles || []) as string[];
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    return requiredRoles.some(role => userRoles.includes(role));
}

export async function checkRoleOrForbidden(roles: string | string[]) {
    const { session, response: authResponse } = await getSessionOrUnauthorized();
    if (authResponse) return { session: null, response: authResponse };

    if (!hasRole(session, roles)) {
        return { session, response: NextResponse.json({ error: 'Interdit' }, { status: 403 }) };
    }

    return { session, response: null };
}

export async function checkAdminOrForbidden() {
    return checkRoleOrForbidden(ROLES.ADMIN);
}
