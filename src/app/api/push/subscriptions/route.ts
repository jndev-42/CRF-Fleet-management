import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/apiAuth';
import { isInactive } from '@/lib/roles';
import { withAudit } from '@/lib/audit/log';

// Le serveur POSTe vers cette URL à chaque notification (SSRF) : https obligatoire et
// uniquement les services push des navigateurs (FCM, Mozilla autopush, WNS, APNs web).
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'web.push.apple.com'];
const PUSH_SERVICE_HOST_SUFFIXES = ['.push.services.mozilla.com', '.notify.windows.com'];

function isPushServiceUrl(value: string): boolean {
    try {
        const { protocol, hostname } = new URL(value);
        return protocol === 'https:'
            && (PUSH_SERVICE_HOSTS.includes(hostname)
                || PUSH_SERVICE_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix)));
    } catch {
        return false;
    }
}

const endpointSchema = z.string().url().max(2048).refine(isPushServiceUrl, {
    message: "L'endpoint doit être celui d'un service push de navigateur",
});

const subscribeSchema = z.object({
    endpoint: endpointSchema,
    keys: z.object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512),
    }),
});

const unsubscribeSchema = z.object({ endpoint: endpointSchema });

// Enregistre (ou réattribue) l'abonnement Web Push de l'appareil courant
async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }
        if (isInactive(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }
        const { endpoint, keys } = parsed.data;
        const userAgent = request.headers.get('user-agent')?.slice(0, 512) || null;

        // Upsert sur l'endpoint : un appareil réutilisé par un autre compte est réattribué
        await db.execute({
            sql: `INSERT INTO "PushSubscription" (id, userId, endpoint, p256dh, auth, userAgent)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(endpoint) DO UPDATE SET
                    userId = excluded.userId,
                    p256dh = excluded.p256dh,
                    auth = excluded.auth,
                    userAgent = excluded.userAgent,
                    lastSeenAt = datetime('now')`,
            args: [crypto.randomUUID(), session.user.id, endpoint, keys.p256dh, keys.auth, userAgent],
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        return NextResponse.json({ error: "Impossible d'enregistrer l'abonnement" }, { status: 500 });
    }
}

// Supprime l'abonnement de l'appareil courant (propriétaire uniquement)
async function deleteHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }
        if (isInactive(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const result = await db.execute({
            sql: `DELETE FROM "PushSubscription" WHERE endpoint = ? AND userId = ?`,
            args: [parsed.data.endpoint, session.user.id],
        });

        if (result.rowsAffected === 0) {
            return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error deleting push subscription:', error);
        return NextResponse.json({ error: "Impossible de supprimer l'abonnement" }, { status: 500 });
    }
}

// POST volontairement non audité : PushProvider le rappelle à chaque chargement de page (réabonnement silencieux).
export const POST = postHandler;
export const DELETE = withAudit(deleteHandler, { action: "Désactivation des notifications push sur un appareil", entityType: 'push-subscription' });
