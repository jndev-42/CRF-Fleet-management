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
        const category = searchParams.get('category') ?? '';
        const page = parseInt(searchParams.get('page') ?? '1', 10);
        const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
        const offset = (page - 1) * pageSize;
        const ulId = session.user.ulId || 'default';

        // Fetch distinct categories list
        if (searchParams.get('categoriesOnly') === '1') {
            const catRes = await db.execute({
                sql: `SELECT DISTINCT category FROM "InvItem" WHERE category IS NOT NULL AND category != '' AND ulId = ? ORDER BY category ASC`,
                args: [ulId]
            });
            return NextResponse.json({ categories: catRes.rows.map(r => r.category) });
        }

        const conditions: string[] = ['ulId = ?'];
        const args: InValue[] = [ulId];

        if (search) {
            conditions.push('(name LIKE ? OR category LIKE ?)');
            args.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            conditions.push('category = ?');
            args.push(category);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as count FROM "InvItem" ${whereClause}`,
            args,
        });
        const total = Number(countRes.rows[0].count);

        const itemsRes = await db.execute({
            sql: `
                SELECT i.*,
                       (SELECT MIN(b.expiryDate)
                        FROM "InvBatch" b
                        WHERE b.itemId = i.id
                          AND b.quantity > 0
                          AND b.expiryDate IS NOT NULL
                       ) AS nearestExpiry
                FROM "InvItem" i
                ${whereClause}
                ORDER BY i.name ASC
                LIMIT ? OFFSET ?
            `,
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
        const { name, category, quantity, notes, expiryDate, minStock } = body;

        if (!name) {
            return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const initialQty = Number(quantity) || 0;
        const minStockVal = minStock !== undefined && minStock !== '' ? Number(minStock) : null;

        const ulId = session.user.ulId || 'default';

        await db.execute({
            sql: `INSERT INTO "InvItem" (id, name, category, quantity, minStock, notes, ulId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            args: [id, name, category || null, initialQty, minStockVal, notes || null, ulId],
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
        const { id, name, category, notes, minStock } = body;

        if (!id) {
            return NextResponse.json({ error: 'L\'identifiant est requis' }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
        }

        const minStockVal = minStock !== undefined && minStock !== '' ? Number(minStock) : null;
        const ulId = session.user.ulId || 'default';

        const res = await db.execute({
            sql: `UPDATE "InvItem" SET name = ?, category = ?, notes = ?, minStock = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND ulId = ?`,
            args: [name, category || null, notes || null, minStockVal, id, ulId],
        });

        if (res.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé ou accès refusé' }, { status: 404 });
        }

        return NextResponse.json({ id, name, category, notes, minStock: minStockVal });
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
        const ulId = session.user.ulId || 'default';

        if (!id) {
            return NextResponse.json({ error: 'L\'identifiant est requis' }, { status: 400 });
        }

        const res = await db.execute({
            sql: `DELETE FROM "InvItem" WHERE id = ? AND ulId = ?`,
            args: [id, ulId],
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
