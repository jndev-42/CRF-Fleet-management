import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';

// Fetch all notifications for the authenticated user
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return unauthorizedResponse();
        }

        const ulId = session.user.ulId || 'default';

        // Une seule requête : la ligne du compte est toujours là (LEFT JOIN), avec des colonnes
        // de notification NULL s'il n'en a aucune. Aucune ligne = compte inconnu.
        const res = await db.execute({
            sql: `
                SELECT n.id, n.title, n.message, n.url, n.isRead, n.createdAt
                FROM "User" u
                LEFT JOIN "Notification" n ON n.userId = u.id AND n.ulId = ?
                WHERE u.email = ?
                ORDER BY n.createdAt DESC
            `,
            args: [ulId, session.user.email]
        });

        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Convert the sqlite data structure into a simple array
        const notifications = res.rows.filter(row => row.id !== null).map(row => ({
            id: row.id,
            title: row.title,
            message: row.message,
            url: row.url,
            isRead: Boolean(row.isRead),
            createdAt: row.createdAt
                ? new Date(String(row.createdAt).replace(' ', 'T') + (String(row.createdAt).includes('Z') || String(row.createdAt).includes('+') ? '' : 'Z')).toISOString()
                : null
        }));

        return NextResponse.json({ notifications }, { status: 200 });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

// Clear all notifications for the authenticated user for the current active UL
async function deleteHandler() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return unauthorizedResponse();
        }

        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [session.user.email]
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userId = userRes.rows[0].id as string;
        const ulId = session.user.ulId || 'default';

        await db.execute({
            sql: `DELETE FROM "Notification" WHERE userId = ? AND ulId = ?`,
            args: [userId, ulId]
        });

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error('Error clearing notifications:', error);
        return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Suppression de toutes ses notifications", entityType: 'notification' });
