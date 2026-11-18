import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { LINK_TYPE_LABELS, taskDeepLink, type TaskLinkInput } from './tasks';
import { firstInvalidLink, invalidAssignees } from './tasksStore';

/**
 * Règles d'écriture communes à la création et à la modification d'une tâche :
 * validation des assignés et des rattachements dans le périmètre de l'UL, puis
 * notification des assignés nouvellement ajoutés. Serveur uniquement.
 */

/**
 * Réponse 400 si un assigné ou un rattachement est hors périmètre, sinon `null`.
 * `existing` : listes déjà enregistrées sur la tâche, acceptées sans revalidation.
 */
export async function checkTaskTargets(
    ulId: string,
    input: { assigneeIds?: string[]; links?: TaskLinkInput[] },
    existing: { assigneeIds: string[]; links: TaskLinkInput[] } = { assigneeIds: [], links: [] },
): Promise<NextResponse | null> {
    if (input.assigneeIds?.length) {
        const refused = await invalidAssignees(ulId, input.assigneeIds, existing.assigneeIds);
        if (refused.length) {
            return NextResponse.json({
                error: 'Assigné invalide : seuls les responsables véhicule et les admins actifs de l\'UL peuvent être assignés.',
                invalidAssigneeIds: refused,
            }, { status: 400 });
        }
    }
    if (input.links?.length) {
        const bad = await firstInvalidLink(ulId, input.links, existing.links);
        if (bad) {
            return NextResponse.json({
                error: `Rattachement invalide : ${LINK_TYPE_LABELS[bad.type].toLowerCase()} introuvable ou hors de votre UL.`,
                invalidLink: bad,
            }, { status: 400 });
        }
    }
    return null;
}

/**
 * Notifie (in-app + push) les assignés nouvellement ajoutés, jamais l'auteur de la
 * modification. Ne lève jamais : l'enregistrement de la tâche est déjà fait.
 */
export async function notifyNewAssignees(opts: {
    taskId: string;
    title: string;
    ulId: string;
    userIds: string[];
    authorId: string | null | undefined;
    authorName: string | null | undefined;
}): Promise<void> {
    const recipients = opts.userIds.filter(id => id !== opts.authorId);
    if (recipients.length === 0) return;
    try {
        const { notifyUsers } = await import('@/lib/push');
        await notifyUsers({
            userIds: recipients,
            title: 'Nouvelle tâche attribuée',
            message: `${opts.authorName ? `${opts.authorName} vous a attribué` : 'On vous a attribué'} la tâche « ${opts.title} ».`,
            url: taskDeepLink(opts.taskId),
            ulId: opts.ulId,
            excludeUserId: opts.authorId ?? undefined,
        });
    } catch (e: unknown) {
        console.error('[fleet-tracking] notification d\'attribution impossible :', getErrorMessage(e));
    }
}
