import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;
        const isAdmin = isAdminOrAbove(session.user.roles || []);

        // Fetch vehicle by name since [id] is the vehicle name
        const vehicleResult = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE name = ?`,
            args: [id]
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id;

        let sqlQuery = `SELECT ir.id, ir.vehicleId, ir.userId, u.name as userName, u.email as userEmail,
                         ir.tripId, ir.reservationId, ir.type, ir.status, ir.occurredAt,
                         ir.createdAt, ir.submittedAt
                  FROM IncidentReport ir
                  JOIN "User" u ON u.id = ir.userId
                  WHERE ir.vehicleId = ?`;
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic SQL args
        const sqlArgs: any[] = [vehicleId];

        if (!isAdmin) {
            sqlQuery += ` AND ir.userId = ?`;
            sqlArgs.push(session.user.id);
        }

        sqlQuery += ` ORDER BY ir.createdAt DESC`;

        const incidentsResult = await db.execute({
            sql: sqlQuery,
            args: sqlArgs
        });

        const incidents = incidentsResult.rows.map(row => ({
            id: row.id,
            vehicleId: row.vehicleId,
            userId: row.userId,
            userName: row.userName,
            userEmail: row.userEmail,
            tripId: row.tripId,
            reservationId: row.reservationId,
            type: row.type,
            status: row.status,
            occurredAt: row.occurredAt,
            createdAt: row.createdAt,
            submittedAt: row.submittedAt,
            canEdit: row.userId === session.user.id || isAdmin,
        }));

        return NextResponse.json({ incidents });
    } catch (error) {
        console.error('Error fetching vehicle incidents:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
