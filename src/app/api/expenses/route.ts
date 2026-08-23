import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import crypto from 'crypto';
import { unauthorizedResponse } from '@/lib/apiAuth';

const expenseReportSchema = z.object({
    status: z.enum(['brouillon', 'soumis']),
    missionName: z.string().trim().min(1, 'Le nom de la mission est requis'),
    missionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La date de la mission est requise (format AAAA-MM-JJ)'),
    imputation: z.enum(['DLUS', 'DLAS', 'UL', 'Autre']).optional().default('DLUS'),
    customImputation: z.string().optional().nullable(),
    requestRefund: z.boolean(),
    noReceiptDeclaration: z.boolean(),
    userSignature: z.union([z.string(), z.any()]).optional().nullable(),
    userFunction: z.string().optional().nullable(),
    driveFolderId: z.string().optional().nullable(),
    items: z.array(z.object({
        label: z.string().min(1, 'Le libellé est requis'),
        amount: z.number().positive('Le montant doit être positif')
    })).min(1, 'Au moins une dépense est requise'),
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(request.url);
        const scopeParam = searchParams.get('scope'); // 'my' | 'ul'
        const includeProcessed = searchParams.get('includeProcessed') === 'true';

        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isTresorier = roles.includes('TRESORIER');
        const ulId = session.user.ulId || 'ul-paris-18';
        const userId = session.user.id;

        const scope = (scopeParam === 'my' || (!isManager && !isTresorier)) ? 'my' : 'ul';

        const selectColumns = `
            er.id, er.userId, er.submittedAt, er.status, er.imputation, er.customImputation,
            er.requestRefund, er.noReceiptDeclaration, er.driveFolderId, er.total, er.items,
            er.ulId, er.missionName, er.missionDate, er.validatedAt, er.validatedBy,
            er.rejectionComment, er.rejectedAt,
            er.rejectedBy, er.paidAt, er.paidBy, er.userFunction, er.createdAt, er.updatedAt,
            u.name as userName, u.email as userEmail,
            val.name as validatorName,
            rej.name as rejectorName,
            pay.name as payerName
        `;

        let result;
        if (scope === 'my') {
            result = await db.execute({
                sql: `
                    SELECT ${selectColumns}
                    FROM "ExpenseReport" er
                    LEFT JOIN "User" u ON u.id = er.userId
                    LEFT JOIN "User" val ON val.id = er.validatedBy
                    LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                    LEFT JOIN "User" pay ON pay.id = er.paidBy
                    WHERE er.userId = ?
                    ORDER BY er.submittedAt DESC, er.createdAt DESC
                `,
                args: [userId],
            });
        } else if (isManager) {
            if (includeProcessed) {
                result = await db.execute({
                    sql: `
                        SELECT ${selectColumns}
                        FROM "ExpenseReport" er
                        LEFT JOIN "User" u ON u.id = er.userId
                        LEFT JOIN "User" val ON val.id = er.validatedBy
                        LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                        LEFT JOIN "User" pay ON pay.id = er.paidBy
                        WHERE er.ulId = ?
                        ORDER BY er.submittedAt DESC, er.createdAt DESC
                    `,
                    args: [ulId],
                });
            } else {
                result = await db.execute({
                    sql: `
                        SELECT ${selectColumns}
                        FROM "ExpenseReport" er
                        LEFT JOIN "User" u ON u.id = er.userId
                        LEFT JOIN "User" val ON val.id = er.validatedBy
                        LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                        LEFT JOIN "User" pay ON pay.id = er.paidBy
                        WHERE er.ulId = ? AND er.status != 'traité'
                        ORDER BY er.submittedAt DESC, er.createdAt DESC
                    `,
                    args: [ulId],
                });
            }
        } else if (isTresorier) {
            result = await db.execute({
                sql: `
                    SELECT ${selectColumns}
                    FROM "ExpenseReport" er
                    LEFT JOIN "User" u ON u.id = er.userId
                    LEFT JOIN "User" val ON val.id = er.validatedBy
                    LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                    LEFT JOIN "User" pay ON pay.id = er.paidBy
                    WHERE er.ulId = ? AND er.status = 'en_attente_paiement'
                    ORDER BY er.submittedAt DESC, er.createdAt DESC
                `,
                args: [ulId],
            });
        } else {
            result = await db.execute({
                sql: `
                    SELECT ${selectColumns}
                    FROM "ExpenseReport" er
                    LEFT JOIN "User" u ON u.id = er.userId
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
            let parsedItems: { label: string; amount: number }[] = [];
            try {
                if (typeof row.items === 'string') {
                    const parsed = JSON.parse(row.items);
                    if (Array.isArray(parsed)) {
                        parsedItems = parsed;
                    }
                } else if (Array.isArray(row.items)) {
                    parsedItems = row.items as { label: string; amount: number }[];
                }
            } catch (e) {
                console.error('Failed to parse expense report items', e);
            }

            return {
                id: String(row.id),
                userId: String(row.userId || ''),
                userName: String(row.userName || 'Utilisateur inconnu'),
                userEmail: String(row.userEmail || ''),
                submittedAt: row.submittedAt ? String(row.submittedAt) : '',
                missionName: row.missionName ? String(row.missionName) : null,
                missionDate: row.missionDate ? String(row.missionDate) : null,
                status: (row.status as string) || 'brouillon',
                imputation: (row.imputation as string) || 'DLUS',
                customImputation: (row.customImputation as string) || null,
                requestRefund: row.requestRefund === 1 || row.requestRefund === '1' || String(row.requestRefund) === 'true',
                noReceiptDeclaration: row.noReceiptDeclaration === 1 || row.noReceiptDeclaration === '1' || String(row.noReceiptDeclaration) === 'true',
                driveFolderId: row.driveFolderId ? String(row.driveFolderId) : null,
                total: Number(row.total) || 0,
                items: parsedItems,
                ulId: String(row.ulId || ''),
                validatedAt: row.validatedAt ? String(row.validatedAt) : null,
                validatedBy: row.validatedBy ? String(row.validatedBy) : null,
                validatorName: row.validatorName ? String(row.validatorName) : null,
                rejectionComment: (row.rejectionComment as string) || null,
                rejectedAt: row.rejectedAt ? String(row.rejectedAt) : null,
                rejectedBy: row.rejectedBy ? String(row.rejectedBy) : null,
                rejectorName: row.rejectorName ? String(row.rejectorName) : null,
                paidAt: row.paidAt ? String(row.paidAt) : null,
                paidBy: row.paidBy ? String(row.paidBy) : null,
                payerName: row.payerName ? String(row.payerName) : null,
                userSignature: (row.userSignature as string) || null,
                userFunction: (row.userFunction as string) || null,
                validatorSignature: (row.validatorSignature as string) || null,
                createdAt: row.createdAt ? String(row.createdAt) : '',
                updatedAt: row.updatedAt ? String(row.updatedAt) : '',
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
            return unauthorizedResponse();
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

        const userSigStr = typeof data.userSignature === 'object' && data.userSignature !== null
            ? JSON.stringify(data.userSignature)
            : (data.userSignature || null);

        await db.execute({
            sql: `
                INSERT INTO "ExpenseReport" (
                    id, userId, submittedAt, status, imputation, customImputation, requestRefund, noReceiptDeclaration,
                    userSignature, userFunction, driveFolderId, total, items, ulId, missionName, missionDate, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                userSigStr,
                data.userFunction || null,
                data.driveFolderId || null,
                total,
                JSON.stringify(data.items),
                ulId,
                data.missionName.trim(),
                data.missionDate,
                now,
                now
            ],
        });

        if (data.status === 'soumis') {
            try {
                const requesterName = session.user.name || session.user.email || 'Un membre';
                const { sendPushNotification } = await import('@/lib/onesignal');
                await sendPushNotification({
                    tags: [{ field: "tag", key: "role_PRESIDENT", relation: "=", value: "true" }],
                    headings: { fr: `📋 Note de frais à valider`, en: `📋 Expense report pending approval` },
                    contents: {
                        fr: `${requesterName} a soumis une note de frais (${total.toFixed(2)} €) à valider.`,
                        en: `${requesterName} submitted an expense report (${total.toFixed(2)} €) pending approval.`
                    },
                    url: `/expenses`,
                    ulId
                });
            } catch (notifErr) {
                console.error('Failed to send expense notification to president:', notifErr);
            }
        }

        return NextResponse.json({ success: true, id }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/expenses]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la création de la note de frais.' }, { status: 500 });
    }
}
