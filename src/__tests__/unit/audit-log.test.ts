/**
 * Tests unitaires — `src/lib/audit/log.ts` (journal d'audit).
 *
 * La base, `after()` et la session sont mockés : on vérifie ce qui est écrit,
 * que l'écriture ne casse jamais la route, et l'attribution en impersonation.
 * L'écriture réelle en SQLite est couverte par `integration/audit-logs.test.ts`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { execute } }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));

const scheduled = vi.hoisted(() => ({ tasks: [] as (() => Promise<void>)[], throwOutsideScope: false }));
vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/server')>()),
    after: vi.fn((task: () => Promise<void>) => {
        if (scheduled.throwOutsideScope) throw new Error('`after` was called outside a request scope');
        scheduled.tasks.push(task);
    }),
}));

import { auth } from '@/auth';
import { AUDITED, actorFromSession, purgeAuditLogs, recordAudit, withAudit } from '@/lib/audit/log';

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

/** Exécute les tâches différées par `after()`, comme Next.js après la réponse. */
async function flushAfter() {
    const tasks = scheduled.tasks.splice(0);
    for (const task of tasks) await task();
}

/** Arguments du dernier INSERT, indexés par nom de colonne. */
function lastInsert(): Record<string, unknown> {
    const call = execute.mock.calls.findLast(c => String(c[0].sql).includes('INSERT INTO "AuditLog"'));
    if (!call) throw new Error('aucun INSERT AuditLog');
    const cols = ['id', 'createdAt', 'actorUserId', 'actorEmail', 'actorName', 'impersonatedEmail', 'ulId',
        'method', 'path', 'action', 'entityType', 'entityId', 'status', 'ip', 'userAgent'];
    return Object.fromEntries(cols.map((c, i) => [c, call[0].args[i]]));
}

type RouteArgs = [request: Request, context?: { params: Promise<Record<string, string>> }];

/** Donne à un handler de test la signature d'un handler de route Next.js. */
function route(fn: () => Promise<Response>): (...args: RouteArgs) => Promise<Response> {
    return fn;
}

function ctx<P extends Record<string, string>>(params: P) {
    return { params: Promise.resolve(params) };
}

beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    mockedAuth.mockReset();
    scheduled.tasks = [];
    scheduled.throwOutsideScope = false;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('recordAudit', () => {
    it('écrit une ligne paramétrée avec un horodatage ISO', async () => {
        await recordAudit({
            actorEmail: 'Admin@Croix-Rouge.fr', method: 'DELETE', path: '/api/vehicles/abc',
            action: "Suppression d'un véhicule", entityType: 'vehicle', entityId: 'abc', status: 200,
        });
        const row = lastInsert();
        expect(row.actorEmail).toBe('admin@croix-rouge.fr');
        expect(row.action).toBe("Suppression d'un véhicule");
        expect(row.status).toBe(200);
        expect(new Date(String(row.createdAt)).toISOString()).toBe(row.createdAt);
    });

    it('tronque le user-agent', async () => {
        await recordAudit({ actorEmail: null, method: 'POST', path: '/x', action: 'a', status: 200, userAgent: 'x'.repeat(1000) });
        expect(String(lastInsert().userAgent)).toHaveLength(300);
    });

    it("ne lève jamais : un échec d'écriture est loggé [audit]", async () => {
        execute.mockRejectedValueOnce(new Error('DB indisponible'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(recordAudit({ actorEmail: null, method: 'POST', path: '/x', action: 'a', status: 200 })).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[audit]'), 'DB indisponible');
    });
});

describe('actorFromSession', () => {
    it("attribue l'action au vrai utilisateur en impersonation", () => {
        const actor = actorFromSession({
            user: { id: 'u-x', email: 'x@croix-rouge.fr', name: 'X', ulId: 'ul-1', originalEmail: 'super@croix-rouge.fr' },
        });
        expect(actor).toEqual({
            actorUserId: null,
            actorEmail: 'super@croix-rouge.fr',
            actorName: null,
            impersonatedEmail: 'x@croix-rouge.fr',
            // UL active de l'utilisateur incarné : pas celle de l'auteur.
            ulId: null,
        });
    });

    it("sans impersonation, l'auteur est l'utilisateur de la session", () => {
        const actor = actorFromSession({
            user: { id: 'u-1', email: 'a@croix-rouge.fr', name: 'A', ulId: 'ul-1', originalEmail: 'a@croix-rouge.fr' },
        });
        expect(actor).toMatchObject({ actorUserId: 'u-1', actorEmail: 'a@croix-rouge.fr', actorName: 'A', impersonatedEmail: null, ulId: 'ul-1' });
    });

    it("la sentinelle 'default' n'est pas enregistrée comme UL", () => {
        expect(actorFromSession({ user: { id: 'u-1', email: 'a@croix-rouge.fr', ulId: 'default' } }).ulId).toBeNull();
    });

    it('sans session, auteur inconnu', () => {
        expect(actorFromSession(null)).toEqual({ actorEmail: null });
    });
});

describe('withAudit', () => {
    it("trace l'action après la réponse, avec la ressource et le code", async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u-1', email: 'admin@croix-rouge.fr', name: 'Admin', ulId: 'ul-1', roles: ['ADMIN'] } });
        const handler = vi.fn(async () => Response.json({ success: true }, { status: 200 }));
        const DELETE = withAudit(route(handler), { action: "Suppression d'un véhicule", entityType: 'vehicle' });

        const res = await DELETE(new Request('http://localhost/api/vehicles/abc', {
            method: 'DELETE',
            headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'vitest' },
        }), ctx({ id: 'abc' }));

        expect(res.status).toBe(200);
        // Rien n'est écrit avant la fin de la réponse.
        expect(execute).not.toHaveBeenCalled();
        await flushAfter();
        expect(lastInsert()).toMatchObject({
            actorEmail: 'admin@croix-rouge.fr', method: 'DELETE', path: '/api/vehicles/abc',
            action: "Suppression d'un véhicule", entityType: 'vehicle', entityId: 'abc',
            status: 200, ip: '203.0.113.7', userAgent: 'vitest', ulId: 'ul-1',
        });
    });

    it('trace aussi les refus avec leur code', async () => {
        mockedAuth.mockResolvedValue(null);
        const POST = withAudit(route(async () => Response.json({ error: 'Non authentifié' }, { status: 401 })), { action: 'Prise', entityType: 'trip' });
        const res = await POST(new Request('http://localhost/api/trips', { method: 'POST' }));
        expect(res.status).toBe(401);
        await flushAfter();
        expect(lastInsert()).toMatchObject({ actorEmail: null, status: 401, entityId: null });
    });

    it('trace un 500 et relaie l\'exception du handler', async () => {
        mockedAuth.mockResolvedValue(null);
        const PATCH = withAudit(route(async (): Promise<Response> => { throw new Error('boom'); }), { action: 'X' });
        await expect(PATCH(new Request('http://localhost/api/x', { method: 'PATCH' }))).rejects.toThrow('boom');
        await flushAfter();
        expect(lastInsert().status).toBe(500);
    });

    it('enregistre le vrai utilisateur en impersonation', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u-x', email: 'x@croix-rouge.fr', originalEmail: 'super@croix-rouge.fr', ulId: 'ul-1', roles: [] } });
        const POST = withAudit(route(async () => Response.json({}, { status: 201 })), { action: "Prise d'un véhicule", entityType: 'trip' });
        await POST(new Request('http://localhost/api/trips', { method: 'POST' }));
        await flushAfter();
        expect(lastInsert()).toMatchObject({ actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr' });
    });

    it('masque le jeton QR du chemin et ne le prend jamais pour id', async () => {
        mockedAuth.mockResolvedValue(null);
        const POST = withAudit(route(async () => Response.json({}, { status: 200 })), { action: 'QR', entityType: 'uniformLoan' });
        await POST(
            new Request('http://localhost/api/qr-uniforms/secret-tok/laundry/loan-1', { method: 'POST' }),
            ctx({ token: 'secret-tok', loanId: 'loan-1' }),
        );
        await flushAfter();
        const row = lastInsert();
        expect(row.path).toBe('/api/qr-uniforms/:token/laundry/loan-1');
        expect(row.entityId).toBe('loan-1');
        expect(JSON.stringify(execute.mock.calls)).not.toContain('secret-tok');
    });

    it('idParam choisit le paramètre portant la ressource', async () => {
        mockedAuth.mockResolvedValue(null);
        const DELETE = withAudit(route(async () => Response.json({})), { action: 'X', idParam: 'id' });
        await DELETE(new Request('http://localhost/api/a/1/b/2', { method: 'DELETE' }), ctx({ id: '1', sub: '2' }));
        await flushAfter();
        expect(lastInsert().entityId).toBe('1');
    });

    it("à défaut de paramètre de route, l'id vient de la requête (?id=)", async () => {
        mockedAuth.mockResolvedValue(null);
        const DELETE = withAudit(route(async () => Response.json({})), { action: 'X', entityType: 'inventoryItem' });
        await DELETE(new Request('http://localhost/api/inventory?id=item-42', { method: 'DELETE' }), ctx({}));
        await flushAfter();
        expect(lastInsert()).toMatchObject({ entityId: 'item-42', path: '/api/inventory' });
    });

    describe('actionsByBodyAction', () => {
        const options = {
            action: "Modification d'une note de frais",
            entityType: 'expense',
            actionsByBodyAction: { validate: "Validation d'une note de frais", pay: "Paiement d'une note de frais" },
        };
        function patch(body: string, contentType = 'application/json') {
            return new Request('http://localhost/api/expenses/e1', {
                method: 'PATCH', headers: { 'content-type': contentType }, body,
            });
        }

        it('choisit le libellé selon `action`, sans priver le handler du corps', async () => {
            mockedAuth.mockResolvedValue(null);
            let seen: unknown;
            const handler = async (req: Request) => { seen = await req.json(); return Response.json({}); };
            const PATCH = withAudit(handler, options);
            await PATCH(patch(JSON.stringify({ action: 'validate', validatorSignature: 'data:secret' })));
            await flushAfter();
            expect(seen).toEqual({ action: 'validate', validatorSignature: 'data:secret' });
            expect(lastInsert().action).toBe("Validation d'une note de frais");
            // Le corps n'est jamais stocké.
            expect(JSON.stringify(execute.mock.calls)).not.toContain('data:secret');
        });

        it.each([
            ['action inconnue', JSON.stringify({ action: 'update' }), 'application/json'],
            ['corps illisible', '{pas du json', 'application/json'],
            ['corps non JSON', 'action=validate', 'application/x-www-form-urlencoded'],
            ['clé héritée du prototype', JSON.stringify({ action: 'toString' }), 'application/json'],
        ])('%s : libellé par défaut', async (_case, body, contentType) => {
            mockedAuth.mockResolvedValue(null);
            const PATCH = withAudit(async (req: Request) => { await req.text(); return Response.json({}); }, options);
            await PATCH(patch(body, contentType));
            await flushAfter();
            expect(lastInsert().action).toBe("Modification d'une note de frais");
        });
    });

    describe('emptyBodyAction', () => {
        const options = {
            action: "Modification d'une réservation",
            entityType: 'reservation',
            actionsByBodyAction: { validate: "Validation d'une réservation" },
            emptyBodyAction: "Validation d'une réservation",
        };
        const handler = async (req: Request) => { await req.text(); return Response.json({}); };

        it.each([
            ['sans corps ni Content-Type', undefined, undefined],
            ['corps vide en JSON', '', 'application/json'],
            ['corps blanc sans Content-Type', '  \n ', undefined],
        ])('%s : libellé du corps vide', async (_case, body, contentType) => {
            mockedAuth.mockResolvedValue(null);
            const PATCH = withAudit(handler, options);
            await PATCH(new Request('http://localhost/api/reservations/r1', {
                method: 'PATCH',
                headers: contentType ? { 'content-type': contentType } : {},
                body,
            }));
            await flushAfter();
            expect(lastInsert().action).toBe("Validation d'une réservation");
        });

        it('un corps non vide garde la règle habituelle', async () => {
            mockedAuth.mockResolvedValue(null);
            const PATCH = withAudit(handler, options);
            await PATCH(new Request('http://localhost/api/reservations/r1', {
                method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'x' }),
            }));
            await flushAfter();
            expect(lastInsert().action).toBe("Modification d'une réservation");
        });

        it('sans emptyBodyAction, un corps vide garde le libellé par défaut', async () => {
            mockedAuth.mockResolvedValue(null);
            const PATCH = withAudit(handler, { action: 'Défaut', actionsByBodyAction: { validate: 'V' } });
            await PATCH(new Request('http://localhost/api/x', { method: 'PATCH' }));
            await flushAfter();
            expect(lastInsert().action).toBe('Défaut');
        });
    });

    it("un échec d'audit ne change pas la réponse", async () => {
        mockedAuth.mockRejectedValue(new Error('session illisible'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = Response.json({ ok: true }, { status: 200 });
        const POST = withAudit(route(async () => response), { action: 'X' });
        await expect(POST(new Request('http://localhost/api/x', { method: 'POST' }))).resolves.toBe(response);
        await expect(flushAfter()).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[audit]'), 'session illisible');
    });

    it('hors contexte de requête, la route répond sans tracer', async () => {
        scheduled.throwOutsideScope = true;
        const POST = withAudit(route(async () => Response.json({}, { status: 201 })), { action: 'X' });
        const res = await POST(new Request('http://localhost/api/x', { method: 'POST' }));
        expect(res.status).toBe(201);
        expect(execute).not.toHaveBeenCalled();
    });

    it('marque le handler enveloppé', () => {
        const wrapped = withAudit(route(async () => Response.json({})), { action: 'X' });
        expect((wrapped as unknown as Record<symbol, unknown>)[AUDITED]).toBe(true);
    });
});

describe('purgeAuditLogs', () => {
    it('supprime les entrées antérieures à la fenêtre (30 jours par défaut)', async () => {
        execute.mockResolvedValueOnce({ rows: [], rowsAffected: 7 });
        const before = Date.now();
        await expect(purgeAuditLogs()).resolves.toBe(7);
        const [call] = execute.mock.calls;
        expect(call[0].sql).toMatch(/DELETE FROM "AuditLog" WHERE createdAt < \?/);
        const cutoff = new Date(call[0].args[0]).getTime();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        expect(before - cutoff).toBeGreaterThanOrEqual(thirtyDays - 1000);
        expect(before - cutoff).toBeLessThanOrEqual(thirtyDays + 1000);
    });

    it('accepte une autre durée', async () => {
        await purgeAuditLogs(1);
        const cutoff = new Date(execute.mock.calls[0][0].args[0]).getTime();
        expect(Date.now() - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
        expect(Date.now() - cutoff).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    });
});
