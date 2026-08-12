import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return unauthorizedResponse();
        }

        const notificationId = (await params).id;

        // Ensure the notification belongs to this user
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [session.user.email]
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userId = userRes.rows[0].id as string;

        // Delete the specific notification
        const result = await db.execute({
            sql: `DELETE FROM "Notification" WHERE id = ? AND userId = ?`,
            args: [notificationId, userId]
        });

        if (result.rowsAffected === 0) {
            return NextResponse.json({ error: 'Notification not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error('Error deleting notification:', error);
        return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
    }
}
