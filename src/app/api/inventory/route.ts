import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import type { InValue } from '@libsql/client';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') ?? '';
        const page = parseInt(searchParams.get('page') ?? '1', 10);
        const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
        const offset = (page - 1) * pageSize;

        const args: InValue[] = [];
        let whereClause = '';

        if (search) {
            whereClause = 'WHERE name LIKE ? OR category LIKE ?';
            args.push(`%${search}%`, `%${search}%`);
        }

        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as count FROM "InvItem" ${whereClause}`,
            args,
        });
        const total = Number(countRes.rows[0].count);

        const itemsRes = await db.execute({
            sql: `SELECT * FROM "InvItem" ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
            args: [...args, pageSize, offset],
        });

        return NextResponse.json({
            items: itemsRes.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            }
        });
    } catch (e) {
        console.error('GET /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération de l\'inventaire' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!userRoles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
        }

        const body = await request.json();
        const { name, category, quantity, notes } = body;

        if (!name) {
            return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
        }

        const id = crypto.randomUUID();
        await db.execute({
            sql: `INSERT INTO "InvItem" (id, name, category, quantity, notes) VALUES (?, ?, ?, ?, ?)`,
            args: [id, name, category || null, quantity || 0, notes || null],
        });

        // Log initial quantity if > 0
        if (quantity > 0) {
            await db.execute({
                sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), id, quantity, session.user.name || session.user.email, 'Initialisation'],
            });
        }

        return NextResponse.json({ id, name, category, quantity, notes }, { status: 201 });
    } catch (e) {
        console.error('POST /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création de l\'article' }, { status: 500 });
    }
}
