import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const updateExpenseReportSchema = z.object({
    action: z.enum(['update', 'submit', 'validate']),
    status: z.enum(['brouillon', 'soumis', 'validé']).optional(),
    requestRefund: z.boolean().optional(),
    noReceiptDeclaration: z.boolean().optional(),
    driveFolderId: z.string().optional().nullable(),
    items: z.array(z.object({
        label: z.string().min(1),
        amount: z.number().positive()
    })).optional(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const resolvedParams = await params;
        const id = resolvedParams.id;

        const result = await db.execute({
            sql: `
                SELECT er.*, u.name as userName, u.email as userEmail, val.name as validatorName
                FROM "ExpenseReport" er
                JOIN "User" u ON u.id = er.userId
                LEFT JOIN "User" val ON val.id = er.validatedBy
                WHERE er.id = ?
            `,
            args: [id],
        });

        const row = result.rows[0];
        if (!row) {
            return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
        }

        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isOwner = row.userId === session.user.id;

        if (!isManager && !isOwner) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        let parsedItems = [];
        try {
            parsedItems = JSON.parse(row.items as string);
        } catch (e) {
            console.error('Failed to parse items', e);
        }

        const report = {
            id: row.id,
            userId: row.userId,
            userName: row.userName,
            userEmail: row.userEmail,
            submittedAt: row.submittedAt,
            status: row.status,
            requestRefund: row.requestRefund === 1,
            noReceiptDeclaration: row.noReceiptDeclaration === 1,
            driveFolderId: row.driveFolderId,
            total: Number(row.total),
            items: parsedItems,
            ulId: row.ulId,
            validatedAt: row.validatedAt,
            validatedBy: row.validatedBy,
            validatorName: row.validatorName,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error('[GET /api/expenses/:id]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const resolvedParams = await params;
        const id = resolvedParams.id;

        // Fetch report first
        const result = await db.execute({
            sql: `SELECT * FROM "ExpenseReport" WHERE id = ?`,
            args: [id],
        });
        const report = result.rows[0];

        if (!report) {
            return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
        }

        const body = await request.json();
        const parsed = updateExpenseReportSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const { action, status, requestRefund, noReceiptDeclaration, driveFolderId, items } = parsed.data;
        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isOwner = report.userId === session.user.id;
        const now = new Date().toISOString();

        if (action === 'validate') {
            // Check roles
            if (!isManager) {
                return NextResponse.json({ error: 'Seuls le Président et les Super Administrateurs peuvent valider des notes de frais.' }, { status: 403 });
            }

            if (report.status !== 'soumis') {
                return NextResponse.json({ error: 'Seules les notes de frais soumises peuvent être validées.' }, { status: 400 });
            }

            await db.execute({
                sql: `
                    UPDATE "ExpenseReport"
                    SET status = 'validé', validatedAt = ?, validatedBy = ?, updatedAt = ?
                    WHERE id = ?
                `,
                args: [now, session.user.id, now, id],
            });

            return NextResponse.json({ success: true });
        } else {
            // update or submit action by the owner
            if (!isOwner) {
                return NextResponse.json({ error: 'Interdit' }, { status: 403 });
            }

            if (report.status !== 'brouillon') {
                return NextResponse.json({ error: 'Seules les notes de frais au statut brouillon peuvent être modifiées.' }, { status: 400 });
            }

            const finalStatus = action === 'submit' ? 'soumis' : (status || 'brouillon');
            const finalRequestRefund = requestRefund !== undefined ? (requestRefund ? 1 : 0) : report.requestRefund;
            const finalNoReceipt = noReceiptDeclaration !== undefined ? (noReceiptDeclaration ? 1 : 0) : report.noReceiptDeclaration;
            const finalDriveFolder = driveFolderId !== undefined ? driveFolderId : report.driveFolderId;
            
            let finalItemsStr = report.items as string;
            let finalTotal = Number(report.total);
            if (items) {
                finalItemsStr = JSON.stringify(items);
                finalTotal = items.reduce((sum, item) => sum + item.amount, 0);
            }

            await db.execute({
                sql: `
                    UPDATE "ExpenseReport"
                    SET status = ?, requestRefund = ?, noReceiptDeclaration = ?, driveFolderId = ?, total = ?, items = ?, submittedAt = ?, updatedAt = ?
                    WHERE id = ?
                `,
                args: [
                    finalStatus,
                    finalRequestRefund,
                    finalNoReceipt,
                    finalDriveFolder,
                    finalTotal,
                    finalItemsStr,
                    now,
                    now,
                    id
                ],
            });

            return NextResponse.json({ success: true });
        }
    } catch (error) {
        console.error('[PATCH /api/expenses/:id]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const resolvedParams = await params;
        const id = resolvedParams.id;

        const result = await db.execute({
            sql: `SELECT userId, status FROM "ExpenseReport" WHERE id = ?`,
            args: [id],
        });
        const report = result.rows[0];

        if (!report) {
            return NextResponse.json({ error: 'Note de frais non trouvée' }, { status: 404 });
        }

        const isOwner = report.userId === session.user.id;
        const roles = session.user.roles || [];
        const isSuperAdmin = roles.includes('SUPER_ADMIN');

        // Owners can delete drafts.
        if (!isOwner && !isSuperAdmin) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        if (report.status !== 'brouillon' && !isSuperAdmin) {
            return NextResponse.json({ error: 'Seules les notes de frais au statut brouillon peuvent être supprimées.' }, { status: 400 });
        }

        await db.execute({
            sql: `DELETE FROM "ExpenseReport" WHERE id = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/expenses/:id]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
