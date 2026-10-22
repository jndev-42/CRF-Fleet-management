import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { MAX_ITEMS_SINGLE_PAGE } from '@/lib/expenses/signature-layout';
import { validateItemBudgets } from '@/lib/expenses/budgets';
import { canPayExpense, canValidateExpenseAsRespo, isPresident, isSuperAdmin as isSuperAdminRole } from '@/lib/roles';
import {
    validationStage, canSignStage, signsBothSteps, canViewExpense, activeUlId, workflowVersionOf,
    type ValidationStage,
} from '@/lib/expenses/workflow';
import { withAudit } from '@/lib/audit/log';

// Crypto, Buffer et rendu PDF : le runtime Edge ne convient pas.
export const runtime = 'nodejs';
// Lecture R2 + scellement : au-delà du défaut de 10 s.
export const maxDuration = 30;

const updateExpenseReportSchema = z.object({
    action: z.enum(['update', 'submit', 'validate', 'reject', 'pay']),
    status: z.enum(['brouillon', 'soumis', 'valide_respo', 'en_attente_paiement', 'traité', 'refusé']).optional(),
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

/** Sérialise une signature reçue du front (objet ou chaîne JSON), `null` si absente. */
function signatureString(raw: unknown): string | null {
    if (typeof raw === 'object' && raw !== null) return JSON.stringify(raw);
    return typeof raw === 'string' && raw ? raw : null;
}

/** Image de signature contenue dans la chaîne JSON reçue du front. */
function signatureImage(sigStr: string): string | null {
    try {
        const parsed = JSON.parse(sigStr);
        return parsed?.image ?? null;
    } catch {
        return null;
    }
}

/**
 * Contrôles communs à la validation et au refus : étape en attente, rôle à cette
 * étape, UL active et auto-validation (décision D2).
 *
 * Renvoie l'étape à signer, ou la réponse d'erreur à retourner telle quelle.
 */
function checkSigningRights(
    report: Record<string, unknown>,
    session: { user: { id: string; roles?: string[]; ulId?: string | null } },
    verb: 'valider' | 'refuser',
): { stage: ValidationStage } | { error: NextResponse } {
    const roles = session.user.roles || [];

    if (!canValidateExpenseAsRespo(roles)) {
        return { error: forbiddenResponse(
            `Seuls le responsable d'activité, le Président et les Super Administrateurs peuvent ${verb} des notes de frais.`) };
    }

    const stage = validationStage(report.status, report.workflowVersion);
    if (!stage) {
        return { error: NextResponse.json({
            error: verb === 'valider'
                ? 'Cette note de frais n\'est pas en attente de validation.'
                : 'Seules les notes de frais en attente de validation peuvent être refusées.',
        }, { status: 400 }) };
    }

    if (!canSignStage(roles, stage)) {
        return { error: forbiddenResponse(stage === 'respo'
            ? `Seuls le responsable d'activité et le Président peuvent ${verb} cette note de frais.`
            : `Seuls le Président et les Super Administrateurs peuvent ${verb} cette note de frais à cette étape.`) };
    }

    // Les rôles sont ceux de l'UL active : ils ne valent pas pour une autre UL.
    if (!isSuperAdminRole(roles) && activeUlId(report.ulId as string | null) !== activeUlId(session.user.ulId)) {
        return { error: forbiddenResponse('Cette note de frais relève d\'une autre unité locale.') };
    }

    // D2 : personne ne signe une étape de validation de sa propre note.
    if (report.userId === session.user.id) {
        return { error: forbiddenResponse(`Vous ne pouvez pas ${verb} votre propre note de frais.`) };
    }

    return { stage };
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
                       val.name as validatorName, rej.name as rejectorName, pay.name as payerName,
                       respo.name as respoValidatorName
                FROM "ExpenseReport" er
                JOIN "User" u ON u.id = er.userId
                LEFT JOIN "User" val ON val.id = er.validatedBy
                LEFT JOIN "User" respo ON respo.id = er.respoValidatedBy
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

        const viewer = { id: session.user.id, roles: session.user.roles || [], ulId: session.user.ulId };
        if (!canViewExpense(viewer, { userId: row.userId, status: row.status, ulId: row.ulId })) {
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
            workflowVersion: workflowVersionOf(row.workflowVersion),
            respoValidatedAt: (row.respoValidatedAt as string) || null,
            respoValidatedBy: (row.respoValidatedBy as string) || null,
            respoValidatorName: (row.respoValidatorName as string) || null,
            respoSignature: (row.respoSignature as string) || null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error('[GET /api/expenses/:id]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * Prévient le demandeur d'une décision sur sa note de frais (in-app + push).
 * Jamais bloquant pour la route ; l'auteur de la décision n'est pas notifié de sa propre action.
 */
async function notifyRequester(
    report: Record<string, unknown>,
    actorId: string,
    title: string,
    message: string,
): Promise<void> {
    try {
        const { notifyUsers } = await import('@/lib/push');
        await notifyUsers({
            userIds: [report.userId as string],
            title,
            message,
            url: `/expenses`,
            ulId: (report.ulId as string) || 'ul-paris-18',
            excludeUserId: actorId,
        });
    } catch (notifErr) {
        console.error('Failed to send expense decision notification to requester:', notifErr);
    }
}

async function patchHandler(
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
        const isOwner = report.userId === session.user.id;
        const now = new Date().toISOString();

        if (action === 'validate') {
            const rights = checkSigningRights(report, session, 'valider');
            if ('error' in rights) return rights.error;
            const { stage } = rights;

            const valSigStr = signatureString(validatorSignature);
            if (!valSigStr) {
                return NextResponse.json({ error: 'Votre signature est requise pour valider la note de frais.' }, { status: 400 });
            }

            const signer = {
                id: session.user.id,
                name: session.user.name || session.user.email || 'Valideur',
                signatureImage: signatureImage(valSigStr),
            };
            // Statut atteint quand la validation est FINALE (président, ou note v1).
            const finalStatus = report.requestRefund === 1 ? 'en_attente_paiement' : 'traité';
            const respoOnly = stage === 'respo' && !signsBothSteps(roles, stage);
            const nextStatus = respoOnly ? 'valide_respo' : finalStatus;
            const expectedStatus = report.status as string;

            try {
                const { sealStep2, sealPresident } = await import('@/lib/expenses/sealing');
                const { persistSealed } = await import('@/lib/expenses/persist-seal');
                const respoColumns = { respoValidatedAt: now, respoValidatedBy: session.user.id, respoSignature: valSigStr };
                const presidentColumns = { validatedAt: now, validatedBy: session.user.id, validatorSignature: valSigStr };

                if (stage === 'legacy') {
                    // Note v1 : son PDF n'a que trois champs, le président valide
                    // dans `Signature2`, comme avant.
                    const seal = await sealStep2(id, signer, { stage: 'legacy' });
                    await persistSealed({ reportId: id, seal, expectedStatus, nextStatus, extraColumns: presidentColumns });
                } else if (stage === 'president') {
                    const seal = await sealPresident(id, signer);
                    await persistSealed({ reportId: id, seal, expectedStatus, nextStatus, extraColumns: presidentColumns });
                } else if (respoOnly) {
                    const seal = await sealStep2(id, signer);
                    await persistSealed({ reportId: id, seal, expectedStatus, nextStatus, extraColumns: respoColumns });
                } else {
                    // Le président signe à la place du RESPO : deux révisions, la
                    // RESPO puis la sienne (tampon compris), enchaînées en mémoire
                    // et persistées d'un seul tenant.
                    const respoSeal = await sealStep2(id, signer);
                    const presidentSeal = await sealPresident(id, signer, { after: respoSeal });
                    await persistSealed({
                        reportId: id, seal: [respoSeal, presidentSeal], expectedStatus, nextStatus,
                        extraColumns: { ...respoColumns, ...presidentColumns },
                    });
                }
            } catch (e: unknown) {
                return sealFailure(e, 'validation');
            }

            const requesterName = (report.userName as string) || (report.userEmail as string) || 'Un membre';
            const expenseTotal = Number(report.total);
            const reportUlId = (report.ulId as string) || 'ul-paris-18';

            if (nextStatus === 'valide_respo') {
                // D3 : après la validation RESPO, seul le président est notifié.
                try {
                    const { sendPushNotification } = await import('@/lib/push');
                    await sendPushNotification({
                        roles: ['PRESIDENT'],
                        headings: { fr: `📋 Note de frais à valider`, en: `📋 Expense report pending approval` },
                        contents: {
                            fr: `La note de frais de ${requesterName} (${expenseTotal.toFixed(2)} €) a été validée par le responsable d'activité et attend votre validation.`,
                            en: `Expense report from ${requesterName} (${expenseTotal.toFixed(2)} €) was approved by the activity manager and awaits your approval.`
                        },
                        url: `/expenses`,
                        ulId: reportUlId,
                        excludeUserId: session.user.id
                    });
                } catch (notifErr) {
                    console.error('Failed to send expense notification to president:', notifErr);
                }
            } else if (nextStatus === 'en_attente_paiement') {
                try {
                    const { sendPushNotification } = await import('@/lib/push');
                    await sendPushNotification({
                        roles: ['TRESORIER'],
                        headings: { fr: `💶 Note de frais à payer`, en: `💶 Expense report pending payment` },
                        contents: {
                            fr: `La note de frais de ${requesterName} (${expenseTotal.toFixed(2)} €) a été validée et est en attente de paiement.`,
                            en: `Expense report from ${requesterName} (${expenseTotal.toFixed(2)} €) was approved and is pending payment.`
                        },
                        url: `/expenses`,
                        ulId: reportUlId,
                        excludeUserId: session.user.id
                    });
                } catch (notifErr) {
                    console.error('Failed to send expense payment notification to tresorier:', notifErr);
                }
            }

            await notifyRequester(
                report, session.user.id,
                nextStatus === 'valide_respo' ? `✅ Note de frais validée par le responsable` : `✅ Note de frais validée`,
                nextStatus === 'valide_respo'
                    ? `Votre note de frais a été validée par le responsable d'activité, en attente de la validation du président.`
                    : nextStatus === 'en_attente_paiement'
                    ? `Votre note de frais a été validée, en attente de paiement.`
                    : `Votre note de frais a été validée.`,
            );

            return NextResponse.json({ success: true, status: nextStatus });
        } else if (action === 'reject') {
            const rights = checkSigningRights(report, session, 'refuser');
            if ('error' in rights) return rights.error;
            const { stage } = rights;

            if (!rejectionComment || !rejectionComment.trim()) {
                return NextResponse.json({ error: 'Un commentaire est obligatoire pour refuser une note de frais.' }, { status: 400 });
            }

            // Décision D5 : le refus est lui aussi un événement SIGNÉ, et il clôt
            // définitivement le document. Une correction passe par une note neuve.
            const rejSigStr = signatureString(validatorSignature);
            if (!rejSigStr) {
                return NextResponse.json({ error: 'Votre signature est requise pour refuser la note de frais.' }, { status: 400 });
            }

            const signer = {
                id: session.user.id,
                name: session.user.name || session.user.email || 'Valideur',
                signatureImage: signatureImage(rejSigStr),
            };
            const rejectionColumns = { rejectionComment: rejectionComment.trim(), rejectedAt: now, rejectedBy: session.user.id };

            try {
                const { sealStep2, sealPresident } = await import('@/lib/expenses/sealing');
                const { persistSealed } = await import('@/lib/expenses/persist-seal');
                // Un refus à l'étape RESPO se signe dans le champ RESPO, même posé
                // par le président ; à l'étape président, dans le sien — sans tampon.
                const seal = stage === 'president'
                    ? await sealPresident(id, signer, { rejected: true })
                    : await sealStep2(id, signer, { rejected: true, stage: stage === 'legacy' ? 'legacy' : 'respo' });
                const signatureColumn: Record<string, string> = stage === 'respo'
                    ? { respoSignature: rejSigStr }
                    : { validatorSignature: rejSigStr };
                await persistSealed({
                    reportId: id, seal,
                    expectedStatus: report.status as string, nextStatus: 'refusé',
                    extraColumns: { ...rejectionColumns, ...signatureColumn },
                });
            } catch (e: unknown) {
                return sealFailure(e, 'refus');
            }

            await notifyRequester(
                report, session.user.id,
                `❌ Note de frais refusée`,
                `Votre note de frais a été refusée : ${rejectionComment.trim()}`,
            );

            return NextResponse.json({ success: true, status: 'refusé' });
        } else if (action === 'pay') {
            const canPay = canPayExpense(roles);
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

            await notifyRequester(
                report, session.user.id,
                `💶 Note de frais payée`,
                `Votre note de frais a été payée.`,
            );

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
                // Même règle qu'à la création : un président ne soumet pas de note
                // à son nom (un brouillon antérieur reste supprimable).
                if (isPresident(roles) && !isSuperAdminRole(roles)) {
                    return forbiddenResponse('Un président ne peut pas soumettre de note de frais à son nom.');
                }
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
                    const { sendPushNotification } = await import('@/lib/push');
                    // D3 : à la soumission, les RESPO et le président de l'UL.
                    await sendPushNotification({
                        roles: ['RESPO', 'PRESIDENT'],
                        headings: { fr: `📋 Note de frais à valider`, en: `📋 Expense report pending approval` },
                        contents: {
                            fr: `${requesterName} a soumis une note de frais (${finalTotal.toFixed(2)} €) à valider.`,
                            en: `${requesterName} submitted an expense report (${finalTotal.toFixed(2)} €) pending approval.`
                        },
                        url: `/expenses`,
                        ulId: reportUlId,
                        excludeUserId: session.user.id
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

async function deleteHandler(
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
        const isSuper = isSuperAdminRole(roles);

        // Owners can delete drafts.
        if (!isOwner && !isSuper) {
            return forbiddenResponse();
        }

        if (report.status !== 'brouillon' && !isSuper) {
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

export const PATCH = withAudit(patchHandler, {
    action: "Modification d'une note de frais",
    entityType: 'expense',
    actionsByBodyAction: {
        validate: "Validation d'une note de frais",
        reject: "Refus d'une note de frais",
        pay: "Paiement d'une note de frais",
    },
});
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'une note de frais", entityType: 'expense' });
