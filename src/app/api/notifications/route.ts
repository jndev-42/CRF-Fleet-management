import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// Fetch all notifications for the authenticated user
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find user ID from email
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [session.user.email]
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userId = userRes.rows[0].id as string;
        const ulId = session.user.ulId || 'default';

        // Fetch notifications
        const notificationsRes = await db.execute({
            sql: `
                SELECT id, title, message, url, isRead, createdAt
                FROM "Notification"
                WHERE userId = ? AND ulId = ?
                ORDER BY createdAt DESC
            `,
            args: [userId, ulId]
        });

        // Convert the sqlite data structure into a simple array
        const notifications = notificationsRes.rows.map(row => ({
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
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
