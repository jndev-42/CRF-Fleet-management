/**
 * Journal d'audit — qui a fait quoi dans l'application.
 *
 * Chaque export mutant (POST/PUT/PATCH/DELETE) d'une route API est enveloppé par
 * `withAudit` : `/api` est hors du matcher de `src/proxy.ts`, et l'élargir
 * changerait le comportement d'auth de toutes les routes (redirections au lieu
 * de 401). L'enrobage explicite donne en plus un libellé lisible par action.
 *
 * Ce qui est tracé : auteur réel (en impersonation, `originalEmail`), action
 * libellée, ressource (type, id), code de réponse. Jamais le corps de la requête,
 * ni valeur avant/après, ni jeton : les paramètres de chemin sensibles (`token`
 * des QR codes) sont masqués dans `path` et ne servent jamais d'`entityId`.
 *
 * L'écriture est non bloquante (`after()` : la latence Turso n'est pas ajoutée à
 * la réponse) et non fatale (un échec est loggé `[audit] …`, la réponse de la
 * route ne change jamais).
 */
import { after } from 'next/server';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';
import { AUDIT_LOG_TABLE, AUDIT_RETENTION_DAYS } from './schema';

export interface AuditEntry {
    actorUserId?: string | null;
    actorEmail: string | null;
    actorName?: string | null;
    impersonatedEmail?: string | null;
    ulId?: string | null;
    method: string;
    path: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    status: number;
    ip?: string | null;
    userAgent?: string | null;
}

export interface AuditOptions {
    /** Libellé français affiché dans le journal, ex. « Suppression d'un véhicule ». */
    action: string;
    /** Type de ressource, ex. `vehicle`. */
    entityType?: string;
    /**
     * Paramètre de route portant l'id de la ressource ; par défaut le dernier paramètre
     * non sensible, puis le paramètre de requête `?id=`.
     */
    idParam?: string;
    /**
     * Libellés plus précis selon le champ `action` du corps JSON (ex. `validate`).
     * Seul ce champ est lu, sur une copie de la requête ; le corps n'est jamais stocké.
     */
    actionsByBodyAction?: Record<string, string>;
    /** Libellé quand le corps est vide (quel que soit le Content-Type), ex. bouton « valider » sans corps. */
    emptyBodyAction?: string;
}

/** Paramètres de chemin qui donnent accès à une ressource : jamais stockés. */
const SENSITIVE_PARAMS = new Set(['token']);

const USER_AGENT_MAX = 300;

/** Marque posée sur les handlers enveloppés (contrôle d'exhaustivité côté tests). */
export const AUDITED = Symbol.for('martine.audited');

/** Écrit une entrée. Ne lève jamais : un échec est loggé et ignoré. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
    try {
        await db.execute({
            sql: `INSERT INTO "${AUDIT_LOG_TABLE}" (
                    id, createdAt, actorUserId, actorEmail, actorName, impersonatedEmail, ulId,
                    method, path, action, entityType, entityId, status, ip, userAgent
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                crypto.randomUUID(),
                new Date().toISOString(),
                entry.actorUserId ?? null,
                entry.actorEmail?.toLowerCase() ?? null,
                entry.actorName ?? null,
                entry.impersonatedEmail?.toLowerCase() ?? null,
                entry.ulId ?? null,
                entry.method,
                entry.path,
                entry.action,
                entry.entityType ?? null,
                entry.entityId ?? null,
                entry.status,
                entry.ip ?? null,
                entry.userAgent ? entry.userAgent.slice(0, USER_AGENT_MAX) : null,
            ],
        });
    } catch (e: unknown) {
        console.error(`[audit] écriture impossible (${entry.method} ${entry.path}) :`, getErrorMessage(e));
    }
}

/** Supprime les entrées de plus de `days` jours. Renvoie le nombre de lignes supprimées. */
export async function purgeAuditLogs(days: number = AUDIT_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const res = await db.execute({
        sql: `DELETE FROM "${AUDIT_LOG_TABLE}" WHERE createdAt < ?`,
        args: [cutoff],
    });
    return res.rowsAffected;
}

type SessionLike = {
    user?: {
        id?: string | null;
        email?: string | null;
        name?: string | null;
        ulId?: string | null;
        originalEmail?: string | null;
    };
} | null;

/** Auteur réel et identité incarnée, à partir de la session NextAuth. */
export function actorFromSession(session: SessionLike): Pick<AuditEntry, 'actorUserId' | 'actorEmail' | 'actorName' | 'impersonatedEmail' | 'ulId'> {
    const user = session?.user;
    if (!user) return { actorEmail: null };
    const effectiveEmail = user.email ?? null;
    const actorEmail = user.originalEmail || effectiveEmail;
    const impersonating = !!effectiveEmail && !!actorEmail
        && effectiveEmail.toLowerCase() !== actorEmail.toLowerCase();
    return {
        // En impersonation, `id` et `name` sont ceux de l'utilisateur incarné : on ne les attribue pas à l'auteur.
        actorUserId: impersonating ? null : user.id ?? null,
        actorEmail,
        actorName: impersonating ? null : user.name ?? null,
        impersonatedEmail: impersonating ? effectiveEmail : null,
        // En impersonation, l'UL active est celle de l'utilisateur incarné ; 'default' n'est pas une UL.
        ulId: impersonating || !user.ulId || user.ulId === 'default' ? null : user.ulId,
    };
}

function clientIp(headers: Headers): string | null {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim() || null;
    return headers.get('x-real-ip');
}

/** Chemin de la requête, paramètres sensibles remplacés par `:<nom>`. */
function redactedPath(pathname: string, params: Record<string, unknown>): string {
    const sensitive = new Map<string, string>();
    for (const [key, value] of Object.entries(params)) {
        if (SENSITIVE_PARAMS.has(key) && typeof value === 'string' && value) {
            sensitive.set(value, key);
            sensitive.set(encodeURIComponent(value), key);
        }
    }
    if (sensitive.size === 0) return pathname;
    return pathname
        .split('/')
        .map(segment => (sensitive.has(segment) ? `:${sensitive.get(segment)}` : segment))
        .join('/');
}

function entityIdFrom(params: Record<string, unknown>, idParam: string | undefined, url: URL | null): string | null {
    if (idParam) {
        const value = params[idParam];
        return typeof value === 'string' ? value : null;
    }
    const candidates = Object.entries(params)
        .filter(([key, value]) => !SENSITIVE_PARAMS.has(key) && typeof value === 'string');
    const last = candidates[candidates.length - 1];
    if (last) return last[1] as string;
    // Routes de collection qui reçoivent l'id en requête (`DELETE /api/inventory?id=…`).
    return url?.searchParams.get('id') || null;
}

/** Libellé précis d'après le champ `action` du corps JSON ; lit une copie, ne garde rien d'autre. */
async function labelFromBody(request: unknown, options: AuditOptions): Promise<string> {
    if (!options.actionsByBodyAction && !options.emptyBodyAction) return options.action;
    if (!(request instanceof Request)) return options.action;
    try {
        const text = await request.clone().text();
        if (text.trim() === '') return options.emptyBodyAction ?? options.action;
        if (!options.actionsByBodyAction) return options.action;
        if (!request.headers.get('content-type')?.includes('application/json')) return options.action;
        const body: unknown = JSON.parse(text);
        const key = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
        if (typeof key === 'string' && Object.hasOwn(options.actionsByBodyAction, key)) {
            return options.actionsByBodyAction[key];
        }
    } catch {
        // Corps absent ou illisible : libellé par défaut.
    }
    return options.action;
}

async function resolveParams(context: unknown): Promise<Record<string, unknown>> {
    if (!context || typeof context !== 'object' || !('params' in context)) return {};
    try {
        const params = await (context as { params: unknown }).params;
        return params && typeof params === 'object' ? params as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

/**
 * Hors contexte de requête Next.js (tests, scripts), `after()` lève : rien n'est
 * tracé, faute de session et de requête réelles.
 */
function schedule(task: () => Promise<void>): void {
    try {
        after(task);
    } catch {
        // Pas de contexte de requête : pas d'audit.
    }
}

/**
 * Enveloppe un handler mutant : exécute le handler, puis trace l'action après la
 * réponse. La réponse (ou l'exception) du handler est toujours renvoyée telle quelle.
 *
 * ```ts
 * export const DELETE = withAudit(deleteVehicle, { action: "Suppression d'un véhicule", entityType: 'vehicle' });
 * ```
 */
export function withAudit<A extends unknown[], R extends Response>(
    handler: (...args: A) => Promise<R>,
    options: AuditOptions,
): (...args: A) => Promise<R> {
    const wrapped = async (...args: A): Promise<R> => {
        let status = 500;
        // Avant le handler : il consomme le corps de la requête.
        const action = await labelFromBody(args[0], options);
        try {
            const response = await handler(...args);
            status = response.status;
            return response;
        } finally {
            // Next.js passe toujours (request, context), même à un handler déclaré sans paramètre.
            const [request, context] = args as unknown[];
            schedule(async () => {
                try {
                    const req = request instanceof Request ? request : null;
                    const params = await resolveParams(context);
                    const { auth } = await import('@/auth');
                    const session = await auth();
                    const url = req ? new URL(req.url) : null;
                    const pathname = url?.pathname ?? '';
                    await recordAudit({
                        ...actorFromSession(session as SessionLike),
                        method: req?.method ?? 'UNKNOWN',
                        path: redactedPath(pathname, params),
                        action,
                        entityType: options.entityType ?? null,
                        entityId: entityIdFrom(params, options.idParam, url),
                        status,
                        ip: req ? clientIp(req.headers) : null,
                        userAgent: req?.headers.get('user-agent') ?? null,
                    });
                } catch (e: unknown) {
                    console.error(`[audit] traçage impossible (${action}) :`, getErrorMessage(e));
                }
            });
        }
    };
    Object.defineProperty(wrapped, AUDITED, { value: true });
    return wrapped;
}
