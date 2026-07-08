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
        const { name, category, quantity, notes, expiryDate } = body;

        if (!name) {
            return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const initialQty = Number(quantity) || 0;

        await db.execute({
            sql: `INSERT INTO "InvItem" (id, name, category, quantity, notes, updatedAt) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            args: [id, name, category || null, initialQty, notes || null],
        });

        // Log initial quantity if > 0
        if (initialQty > 0) {
            await db.execute({
                sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), id, initialQty, session.user.name || session.user.email || 'Inconnu', 'Initialisation'],
            });

            // Create initial batch
            await db.execute({
                sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                args: [crypto.randomUUID(), id, initialQty, expiryDate || null],
            });
        }

        return NextResponse.json({ id, name, category, quantity: initialQty, notes, expiryDate }, { status: 201 });
    } catch (e) {
        console.error('POST /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création de l\'article' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
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
        const { id, name, category, notes } = body;

        if (!id) {
            return NextResponse.json({ error: 'L\'identifiant est requis' }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
        }

        const res = await db.execute({
            sql: `UPDATE "InvItem" SET name = ?, category = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [name, category || null, notes || null, id],
        });

        if (res.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
        }

        return NextResponse.json({ id, name, category, notes });
    } catch (e) {
        console.error('PATCH /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la modification de l\'article' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!userRoles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'L\'identifiant est requis' }, { status: 400 });
        }

        const res = await db.execute({
            sql: `DELETE FROM "InvItem" WHERE id = ?`,
            args: [id],
        });

        if (res.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression de l\'article' }, { status: 500 });
    }
}
