import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { MAX_ITEMS_SINGLE_PAGE } from '@/lib/expenses/signature-layout';
import { validateItemBudgets } from '@/lib/expenses/budgets';

// Crypto, Buffer et rendu PDF : le runtime Edge ne convient pas.
export const runtime = 'nodejs';
// Lecture R2 + scellement : au-delà du défaut de 10 s.
export const maxDuration = 30;

const updateExpenseReportSchema = z.object({
    action: z.enum(['update', 'submit', 'validate', 'reject', 'pay']),
    status: z.enum(['brouillon', 'soumis', 'en_attente_paiement', 'traité', 'refusé']).optional(),
    missionName: z.string().optional().nullable(),
    missionDate: z.string().optional().nullable(),
    imputation: z.enum(['DLUS', 'DLAS', 'UL', 'Autre']).optional(),
    customImputation: z.string().optional().nullable(),
    rejectionComment: z.string().optional().nullable(),
    requestRefund: z.boolean().optional(),
    noReceiptDeclaration: z.boolean().optional(),
    userSignature: z.union([z.string(), z.any()]).optional().nullable(),
    userFunction: z.string().optional().nullable(),
    validatorSignature: z.union([z.string(), z.any()]).optional().nullable(),
    payerSignature: z.union([z.string(), z.any()]).optional().nullable(),
    receiptKeys: z.array(z.string()).optional(),
    // ⚠️ `items` DOIT rester `.optional()`. Les actions validate / reject / pay
    // n'envoient jamais de lignes : les rendre requises bloquerait le circuit de
    // paiement sur des notes DÉJÀ SCELLÉES, donc non corrigeables par ré-édition.
    // Seul `budgetId` est requis À L'INTÉRIEUR d'une ligne effectivement fournie.
    items: z.array(z.object({
        label: z.string().min(1),
        amount: z.number().positive(),
        budgetId: z.string().min(1, 'Le budget est requis')
    })).optional(),
}).superRefine((data, ctx) => {
    // Le nom et la date de mission sont obligatoires dès que le demandeur modifie ou
    // soumet sa note de frais — y compris pour un brouillon créé avant l'ajout du champ.
    if (data.action !== 'update' && data.action !== 'submit') return;

    if (!data.missionName || !data.missionName.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['missionName'],
            message: 'Le nom de la mission est requis',
        });
    }
    if (!data.missionDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.missionDate)) {
        ctx.addIssue({
            code: 'custom',
            path: ['missionDate'],
            message: 'La date de la mission est requise (format AAAA-MM-JJ)',
        });
    }
});

/**
 * Traduit un échec de scellement en réponse HTTP.
 *
 * Le scellement n'est PAS accessoire — contrairement aux notifications push, son
 * échec doit faire échouer la transition métier. Aucun `catch` avaleur ici : la
 * note conserve son statut précédent et l'utilisateur peut réessayer.
 */
function sealFailure(e: unknown, step: string): NextResponse {
    const name = e instanceof Error ? e.constructor.name : '';

    // Journal en base et PDF stocké divergent : état à diagnostiquer, jamais à
    // réparer silencieusement.
    if (name === 'RevisionMismatchError') {
        console.error(`[expenses] incohérence de révisions au ${step}`, e);
        return NextResponse.json({
            error: 'Incohérence détectée entre le document scellé et son journal de signatures. ' +
                   'Contactez un administrateur.',
        }, { status: 409 });
    }

    // Un autre appel a déjà fait avancer la note.
    if (name === 'ConcurrentTransitionError') {
        return NextResponse.json({
            error: 'La note de frais a changé d\'état entre-temps. Rechargez la page et réessayez.',
        }, { status: 409 });
    }

    // Note trop longue pour tenir sur une page (décision D6).
    if (name === 'TooManyItemsError') {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Note trop longue.' }, { status: 400 });
    }

    console.error(`[expenses] scellement ${step} échoué`, e);
    return NextResponse.json({
        error: `Le scellement cryptographique a échoué lors du ${step}. La note n'a pas été modifiée.`,
    }, { status: 500 });
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        const resolvedParams = await params;
        const id = resolvedParams.id;

        const result = await db.execute({
            sql: `
                SELECT er.*, u.name as userName, u.email as userEmail,
                       val.name as validatorName, rej.name as rejectorName, pay.name as payerName
                FROM "ExpenseReport" er
                JOIN "User" u ON u.id = er.userId
                LEFT JOIN "User" val ON val.id = er.validatedBy
                LEFT JOIN "User" rej ON rej.id = er.rejectedBy
                LEFT JOIN "User" pay ON pay.id = er.paidBy
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
        const isTresorier = roles.includes('TRESORIER');
        const isOwner = row.userId === session.user.id;

        if (!isManager && !isOwner && !(isTresorier && row.status === 'en_attente_paiement')) {
            return forbiddenResponse();
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
            missionName: (row.missionName as string) || null,
            missionDate: (row.missionDate as string) || null,
            status: row.status,
            imputation: (row.imputation as string) || 'DLUS',
            customImputation: (row.customImputation as string) || null,
            requestRefund: row.requestRefund === 1,
            noReceiptDeclaration: row.noReceiptDeclaration === 1,
            driveFolderId: row.driveFolderId,
            pendingReceiptKeys: (() => {
                if (typeof row.pendingReceiptKeys !== 'string' || !row.pendingReceiptKeys.trim()) return [];
                try {
                    const parsed = JSON.parse(row.pendingReceiptKeys);
                    return Array.isArray(parsed) ? parsed : [];
                } catch { return []; }
            })(),
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
            userSignature: (row.userSignature as string) || null,
            userFunction: (row.userFunction as string) || null,
            validatorSignature: (row.validatorSignature as string) || null,
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
            return unauthorizedResponse();
        }

        const resolvedParams = await params;
        const id = resolvedParams.id;

        // Fetch report first with requester user info
        const result = await db.execute({
            sql: `
                SELECT er.*, u.name as userName, u.email as userEmail
                FROM "ExpenseReport" er
                JOIN "User" u ON u.id = er.userId
                WHERE er.id = ?
            `,
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

        const { action, missionName, missionDate, imputation, customImputation, rejectionComment, requestRefund, noReceiptDeclaration, userSignature, userFunction, validatorSignature, payerSignature, receiptKeys, items } = parsed.data;
        const roles = session.user.roles || [];
        const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
        const isOwner = report.userId === session.user.id;
        const now = new Date().toISOString();

        if (action === 'validate') {
            // Check roles
            if (!isManager) {
                return forbiddenResponse('Seuls le Président et les Super Administrateurs peuvent valider des notes de frais.');
            }

            if (report.status !== 'soumis') {
                return NextResponse.json({ error: 'Seules les notes de frais soumises peuvent être validées.' }, { status: 400 });
            }

            // Si demande de remboursement -> 'en_attente_paiement', sinon 'traité'
            const nextStatus = report.requestRefund === 1 ? 'en_attente_paiement' : 'traité';
            const valSigStr = typeof validatorSignature === 'object' && validatorSignature !== null
                ? JSON.stringify(validatorSignature)
                : (validatorSignature || null);

            if (!valSigStr) {
                return NextResponse.json({ error: 'Votre signature est requise pour valider la note de frais.' }, { status: 400 });
            }

            try {
                const { sealStep2 } = await import('@/lib/expenses/sealing');
                const { persistSealed } = await import('@/lib/expenses/persist-seal');
                const parsedSig = JSON.parse(valSigStr);
                const seal = await sealStep2(id, {
                    id: session.user.id,
                    name: session.user.name || session.user.email || 'Valideur',
                    signatureImage: parsedSig?.image ?? null,
                });
                await persistSealed({
                    reportId: id, seal,
                    expectedStatus: 'soumis', nextStatus,
                    extraColumns: { validatedAt: now, validatedBy: session.user.id, validatorSignature: valSigStr },
                });
            } catch (e: unknown) {
                return sealFailure(e, 'validation');
            }

            if (nextStatus === 'en_attente_paiement') {
                try {
                    const requesterName = (report.userName as string) || (report.userEmail as string) || 'Un membre';
                    const expenseTotal = Number(report.total);
                    const reportUlId = (report.ulId as string) || 'ul-paris-18';
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    await sendPushNotification({
                        tags: [{ field: "tag", key: "role_TRESORIER", relation: "=", value: "true" }],
                        headings: { fr: `💶 Note de frais à payer`, en: `💶 Expense report pending payment` },
                        contents: {
                            fr: `La note de frais de ${requesterName} (${expenseTotal.toFixed(2)} €) a été validée et est en attente de paiement.`,
                            en: `Expense report from ${requesterName} (${expenseTotal.toFixed(2)} €) was approved and is pending payment.`
                        },
                        url: `/expenses`,
                        ulId: reportUlId
                    });
                } catch (notifErr) {
                    console.error('Failed to send expense payment notification to tresorier:', notifErr);
                }
            }

            return NextResponse.json({ success: true, status: nextStatus });
        } else if (action === 'reject') {
            if (!isManager) {
                return forbiddenResponse('Seuls le Président et les Super Administrateurs peuvent refuser des notes de frais.');
            }

            if (report.status !== 'soumis') {
                return NextResponse.json({ error: 'Seules les notes de frais soumises peuvent être refusées.' }, { status: 400 });
            }

            if (!rejectionComment || !rejectionComment.trim()) {
                return NextResponse.json({ error: 'Un commentaire est obligatoire pour refuser une note de frais.' }, { status: 400 });
            }

            // Décision D5 : le refus est lui aussi un événement SIGNÉ, et il clôt
            // définitivement le document. Une correction passe par une note neuve.
            const rejSigStr = typeof validatorSignature === 'object' && validatorSignature !== null
                ? JSON.stringify(validatorSignature)
                : (validatorSignature || null);

            if (!rejSigStr) {
                return NextResponse.json({ error: 'Votre signature est requise pour refuser la note de frais.' }, { status: 400 });
            }

            try {
                const { sealStep2 } = await import('@/lib/expenses/sealing');
                const { persistSealed } = await import('@/lib/expenses/persist-seal');
                const parsedSig = JSON.parse(rejSigStr);
                const seal = await sealStep2(id, {
                    id: session.user.id,
                    name: session.user.name || session.user.email || 'Valideur',
                    signatureImage: parsedSig?.image ?? null,
                }, { rejected: true });
                await persistSealed({
                    reportId: id, seal,
                    expectedStatus: 'soumis', nextStatus: 'refusé',
                    extraColumns: {
                        rejectionComment: rejectionComment.trim(),
                        rejectedAt: now, rejectedBy: session.user.id,
                        validatorSignature: rejSigStr,
                    },
                });
            } catch (e: unknown) {
                return sealFailure(e, 'refus');
            }

            return NextResponse.json({ success: true, status: 'refusé' });
        } else if (action === 'pay') {
            const canPay = roles.includes('TRESORIER') || roles.includes('SUPER_ADMIN');
            if (!canPay) {
                return forbiddenResponse('Seuls le Trésorier et les Super Administrateurs peuvent marquer une note comme payée.');
            }

            if (report.status !== 'en_attente_paiement') {
                return NextResponse.json({ error: 'Seules les notes de frais en attente de paiement peuvent être marquées comme payées.' }, { status: 400 });
            }

            const paySigStr = typeof payerSignature === 'object' && payerSignature !== null
                ? JSON.stringify(payerSignature)
                : (payerSignature || null);

            if (!paySigStr) {
                return NextResponse.json({ error: 'Votre signature est requise pour marquer la note comme payée.' }, { status: 400 });
            }

            try {
                const { sealStep3 } = await import('@/lib/expenses/sealing');
                const { persistSealed } = await import('@/lib/expenses/persist-seal');
                // Scellement #3 : cryptographique uniquement, AUCUN widget visible.
                const seal = await sealStep3(id, {
                    id: session.user.id,
                    name: session.user.name || session.user.email || 'Trésorier',
                });
                await persistSealed({
                    reportId: id, seal,
                    expectedStatus: 'en_attente_paiement', nextStatus: 'traité',
                    extraColumns: { paidAt: now, paidBy: session.user.id, payerSignature: paySigStr },
                });
            } catch (e: unknown) {
                return sealFailure(e, 'paiement');
            }

            return NextResponse.json({ success: true, status: 'traité' });
        } else {
            // update or submit action by the owner
            if (!isOwner) {
                return forbiddenResponse();
            }

            if (report.status !== 'brouillon') {
                return NextResponse.json({ error: 'Seules les notes de frais au statut brouillon peuvent être modifiées.' }, { status: 400 });
            }

            // Validation référentielle des budgets — uniquement si des lignes sont
            // fournies, et TOUJOURS sur l'UL de la note, jamais celle de la session.
            if (items) {
                const storedBudgetIds = new Set<string>();
                try {
                    const storedItems = JSON.parse(String(report.items ?? '[]'));
                    if (Array.isArray(storedItems)) {
                        for (const stored of storedItems) {
                            if (stored && typeof stored.budgetId === 'string') storedBudgetIds.add(stored.budgetId);
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse expense report items', e);
                }

                const budgetError = await validateItemBudgets(db, String(report.ulId || ''), items, storedBudgetIds);
                if (budgetError) {
                    return NextResponse.json({ error: budgetError }, { status: 400 });
                }
            }

            const finalImputation = imputation || (report.imputation as string) || 'DLUS';
            const finalCustomImputation = finalImputation === 'Autre'
                ? (customImputation !== undefined ? customImputation : (report.customImputation as string || null))
                : null;
            const finalRequestRefund = requestRefund !== undefined ? (requestRefund ? 1 : 0) : report.requestRefund;
            const finalNoReceipt = noReceiptDeclaration !== undefined ? (noReceiptDeclaration ? 1 : 0) : report.noReceiptDeclaration;
            const finalReceiptKeys = receiptKeys !== undefined ? receiptKeys : (() => {
                if (typeof report.pendingReceiptKeys !== 'string' || !report.pendingReceiptKeys.trim()) return [];
                try {
                    const parsed = JSON.parse(report.pendingReceiptKeys);
                    return Array.isArray(parsed) ? parsed : [];
                } catch { return []; }
            })();

            const userSigStr = typeof userSignature === 'object' && userSignature !== null
                ? JSON.stringify(userSignature)
                : (userSignature !== undefined ? (userSignature || null) : (report.userSignature as string || null));
            const finalUserFunction = userFunction !== undefined ? (userFunction || null) : (report.userFunction as string || null);
            // Garantis non vides par le superRefine du schéma pour les actions update/submit.
            const finalMissionName = (missionName ?? '').trim();
            const finalMissionDate = missionDate ?? '';

            let finalItemsStr = report.items as string;
            let finalTotal = Number(report.total);
            if (items) {
                finalItemsStr = JSON.stringify(items);
                finalTotal = items.reduce((sum, item) => sum + item.amount, 0);
            }

            // ── Garde-fous préalables à la soumission ────────────────────────────
            // Une note soumise est scellée immédiatement et le document devient
            // immuable : mieux vaut refuser en amont que produire un PDF invalide.
            if (action === 'submit') {
                if (items && items.length > MAX_ITEMS_SINGLE_PAGE) {
                    return NextResponse.json({
                        error: `Cette note comporte ${items.length} postes de dépense ; le maximum est ` +
                               `${MAX_ITEMS_SINGLE_PAGE} pour tenir sur une page. Merci de la scinder en plusieurs notes.`,
                    }, { status: 400 });
                }
                if (!userSigStr) {
                    return NextResponse.json({
                        error: 'Votre signature est requise pour soumettre la note de frais.',
                    }, { status: 400 });
                }
            }

            // Toujours écrit en brouillon : le passage à « soumis » n'a lieu qu'une
            // fois le PDF scellé et écrit sur R2, exactement comme à la création.
            await db.execute({
                sql: `
                    UPDATE "ExpenseReport"
                    SET status = ?, imputation = ?, customImputation = ?, requestRefund = ?, noReceiptDeclaration = ?, pendingReceiptKeys = ?, total = ?, items = ?, userSignature = ?, userFunction = ?, missionName = ?, missionDate = ?, submittedAt = ?, updatedAt = ?
                    WHERE id = ?
                `,
                args: [
                    'brouillon',
                    finalImputation,
                    finalCustomImputation,
                    finalRequestRefund,
                    finalNoReceipt,
                    finalReceiptKeys.length ? JSON.stringify(finalReceiptKeys) : null,
                    finalTotal,
                    finalItemsStr,
                    userSigStr,
                    finalUserFunction,
                    finalMissionName,
                    finalMissionDate,
                    now,
                    now,
                    id
                ],
            });

            if (action === 'submit') {
                try {
                    const { sealStep1, resolvePendingReceipts } = await import('@/lib/expenses/sealing');
                    const { persistSealed } = await import('@/lib/expenses/persist-seal');

                    const parsedSig = userSigStr ? JSON.parse(userSigStr) : null;
                    const attachments = await resolvePendingReceipts(finalReceiptKeys);
                    const seal = await sealStep1(id, {
                        id: session.user.id,
                        name: session.user.name || session.user.email || 'Demandeur',
                        signatureImage: parsedSig?.image ?? null,
                    }, new Date(), attachments);
                    await persistSealed({
                        reportId: id,
                        seal,
                        expectedStatus: 'brouillon',
                        nextStatus: 'soumis',
                        extraColumns: { pendingReceiptKeys: null },
                    });

                    if (finalReceiptKeys.length) {
                        const { deleteObject } = await import('@/lib/r2');
                        await Promise.allSettled(finalReceiptKeys.map(key => deleteObject(key)));
                    }
                } catch (sealErr: unknown) {
                    console.error('[PATCH /api/expenses/:id] scellement #1 échoué', sealErr);
                    return sealFailure(sealErr, 'soumission');
                }

                try {
                    const requesterName = (report.userName as string) || (report.userEmail as string) || session.user.name || session.user.email || 'Un membre';
                    const reportUlId = (report.ulId as string) || 'ul-paris-18';
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    await sendPushNotification({
                        tags: [{ field: "tag", key: "role_PRESIDENT", relation: "=", value: "true" }],
                        headings: { fr: `📋 Note de frais à valider`, en: `📋 Expense report pending approval` },
                        contents: {
                            fr: `${requesterName} a soumis une note de frais (${finalTotal.toFixed(2)} €) à valider.`,
                            en: `${requesterName} submitted an expense report (${finalTotal.toFixed(2)} €) pending approval.`
                        },
                        url: `/expenses`,
                        ulId: reportUlId
                    });
                } catch (notifErr) {
                    console.error('Failed to send expense notification to president:', notifErr);
                }
            }

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
            return unauthorizedResponse();
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
            return forbiddenResponse();
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
