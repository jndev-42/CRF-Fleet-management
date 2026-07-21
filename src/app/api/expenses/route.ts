import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import crypto from 'crypto';

const expenseReportSchema = z.object({
    status: z.enum(['brouillon', 'soumis']),
    imputation: z.enum(['DLUS', 'DLAS', 'UL', 'Autre']).optional().default('DLUS'),
    customImputation: z.string().optional().nullable(),
    requestRefund: z.boolean(),
    noReceiptDeclaration: z.boolean(),
    driveFolderId: z.string().optional().nullable(),
    items: z.array(z.object({
        label: z.string().min(1, 'Le libellé est requis'),
        amount: z.number().positive('Le montant doit être positif')
    })).min(1, 'Au moins une dépense est requise'),
});

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isTresorier = roles.includes('TRESORIER');
        const ulId = session.user.ulId || 'ul-paris-18';
        const userId = session.user.id;

        let result;
        if (isManager) {
            result = await db.execute({
                sql: `
                    SELECT er.*, u.name as userName, u.email as userEmail, val.name as validatorName, rej.name as rejectorName, pay.name as payerName
                    FROM "ExpenseReport" er
                    JOIN "User" u ON u.id = er.userId
                    LEFT JOIN "User" val ON val.id = er.validatedBy
                    LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                    LEFT JOIN "User" pay ON pay.id = er.paidBy
                    WHERE er.ulId = ?
                    ORDER BY er.submittedAt DESC, er.createdAt DESC
                `,
                args: [ulId],
            });
        } else if (isTresorier) {
            result = await db.execute({
                sql: `
                    SELECT er.*, u.name as userName, u.email as userEmail, val.name as validatorName, rej.name as rejectorName, pay.name as payerName
                    FROM "ExpenseReport" er
                    JOIN "User" u ON u.id = er.userId
                    LEFT JOIN "User" val ON val.id = er.validatedBy
                    LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                    LEFT JOIN "User" pay ON pay.id = er.paidBy
                    WHERE (er.ulId = ? AND er.status = 'en_attente_paiement') OR er.userId = ?
                    ORDER BY er.submittedAt DESC, er.createdAt DESC
                `,
                args: [ulId, userId],
            });
        } else {
            result = await db.execute({
                sql: `
                    SELECT er.*, u.name as userName, u.email as userEmail, val.name as validatorName, rej.name as rejectorName, pay.name as payerName
                    FROM "ExpenseReport" er
                    JOIN "User" u ON u.id = er.userId
                    LEFT JOIN "User" val ON val.id = er.validatedBy
                    LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                    LEFT JOIN "User" pay ON pay.id = er.paidBy
                    WHERE er.userId = ?
                    ORDER BY er.createdAt DESC
                `,
                args: [userId],
            });
        }

        const reports = result.rows.map(row => {
            let parsedItems = [];
            try {
                parsedItems = JSON.parse(row.items as string);
            } catch (e) {
                console.error('Failed to parse expense report items', e);
            }

            return {
                id: row.id,
                userId: row.userId,
                userName: row.userName,
                userEmail: row.userEmail,
                submittedAt: row.submittedAt,
                status: row.status,
                imputation: (row.imputation as string) || 'DLUS',
                customImputation: (row.customImputation as string) || null,
                requestRefund: row.requestRefund === 1,
                noReceiptDeclaration: row.noReceiptDeclaration === 1,
                driveFolderId: row.driveFolderId,
                total: Number(row.total),
                items: parsedItems,
                ulId: row.ulId,
                validatedAt: row.validatedAt,
                validatedBy: row.validatedBy,
                validatorName: row.validatorName,
                rejectionComment: (row.rejectionComment as string) || null,
                rejectedAt: (row.rejectedAt as string) || null,
                rejectedBy: (row.rejectedBy as string) || null,
                rejectorName: (row.rejectorName as string) || null,
                paidAt: (row.paidAt as string) || null,
                paidBy: (row.paidBy as string) || null,
                payerName: (row.payerName as string) || null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            };
        });

        return NextResponse.json(reports);
    } catch (error) {
        console.error('[GET /api/expenses]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la récupération des notes de frais.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = expenseReportSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const data = parsed.data;
        const total = data.items.reduce((sum, item) => sum + item.amount, 0);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const ulId = session.user.ulId || 'ul-paris-18';
        const imputation = data.imputation || 'DLUS';
        const customImputation = imputation === 'Autre' ? (data.customImputation || null) : null;

        await db.execute({
            sql: `
                INSERT INTO "ExpenseReport" (
                    id, userId, submittedAt, status, imputation, customImputation, requestRefund, noReceiptDeclaration,
                    driveFolderId, total, items, ulId, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
                id,
                session.user.id,
                now,
                data.status,
                imputation,
                customImputation,
                data.requestRefund ? 1 : 0,
                data.noReceiptDeclaration ? 1 : 0,
                data.driveFolderId || null,
                total,
                JSON.stringify(data.items),
                ulId,
                now,
                now
            ],
        });

        return NextResponse.json({ success: true, id }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/expenses]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la création de la note de frais.' }, { status: 500 });
    }
}
