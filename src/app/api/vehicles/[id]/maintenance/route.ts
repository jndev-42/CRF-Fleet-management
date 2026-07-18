import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';

const PAGE_SIZE = 5;

const createMaintenanceSchema = z.object({
    date: z.string().min(1, 'Date requise'),
    type: z.enum(['CT', 'REVISION', 'CT_REVISION']),
    mileage: z.number().int().optional(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));

        const vehicleResult = await db.execute({
            sql: `SELECT id FROM "Vehicle" WHERE name = ?`,
            args: [id],
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id as string;

        const totalResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM "VehicleMaintenanceRecord" WHERE vehicleId = ?`,
            args: [vehicleId],
        });
        const total = totalResult.rows[0].total as number;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const offset = (page - 1) * PAGE_SIZE;

        const recordsResult = await db.execute({
            sql: `SELECT id, vehicleId, date, type, mileage, createdAt
                  FROM "VehicleMaintenanceRecord"
                  WHERE vehicleId = ?
                  ORDER BY date DESC
                  LIMIT ? OFFSET ?`,
            args: [vehicleId, PAGE_SIZE, offset],
        });

        const records = recordsResult.rows.map(r => ({
            id: r.id,
            vehicleId: r.vehicleId,
            date: r.date,
            type: r.type,
            mileage: r.mileage ?? null,
            createdAt: r.createdAt,
        }));

        return NextResponse.json({ records, total, page, totalPages });
    } catch (error) {
        console.error('Error fetching maintenance records:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des enregistrements' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = session.user.roles || ['INACTIF'];
        if (!isAdminOrAbove(roles)) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = createMaintenanceSchema.parse(body);

        const vehicleResult = await db.execute({
            sql: `SELECT id FROM "Vehicle" WHERE name = ?`,
            args: [id],
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id as string;
        const recordId = crypto.randomUUID();

        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [recordId, vehicleId, data.date, data.type, data.mileage ?? null],
        });

        const record = {
            id: recordId,
            vehicleId,
            date: data.date,
            type: data.type,
            mileage: data.mileage ?? null,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json({ success: true, record }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error creating maintenance record:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création de l\'enregistrement' },
            { status: 500 }
        );
    }
}
