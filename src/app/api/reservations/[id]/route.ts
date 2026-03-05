import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const reservationId = params.id;

        // Verify that the user owns the reservation or is an ADMIN
        const checkResult = await db.execute({
            sql: `
                SELECT r.userEmail 
                FROM "Reservation" r
                WHERE r.id = ?
            `,
            args: [reservationId]
        });

        if (checkResult.rows.length === 0) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        const ownerEmail = checkResult.rows[0].userEmail as string;
        const isAdmin = session.user.roles?.includes('ADMIN');

        if (ownerEmail !== session.user.email && !isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await db.execute({
            sql: `
                DELETE FROM "Reservation"
                WHERE id = ?
            `,
            args: [reservationId]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
