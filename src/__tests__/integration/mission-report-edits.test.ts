/**
 * Tests d'intégration — accident bénévole, rôle RESP_MISSION, alertes d'incident
 * et modification après envoi avec historique.
 *
 * Couvre :
 *   - PATCH /api/missions/[id] → 401, 404, 403 (ADMIN / RESP_MISSION autre UL,
 *     cadre lecture seule, autre bénévole), 400 (accident sans description,
 *     répartition incohérente), 200 (auteur, RESP_MISSION, ADMIN), sans changement
 *   - PATCH → alerte uniquement pour une case qui passe de faux à vrai
 *   - GET /api/missions/[id] → accident, can_edit, edits (plus récent d'abord), lecture RESP_MISSION
 *   - GET /api/missions → RESP_MISSION liste les rapports de son UL
 *   - POST /api/missions et QR d'UL → alerte appelée ou non, échec push toléré,
 *     rapport DT → UL de rattachement de l'auteur
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn().mockResolvedValue(true) }));

import { GET as getList, POST as postCreate } from '@/app/api/missions/route';
import { GET as getDetail, PATCH as patchReport, DELETE as deleteReport } from '@/app/api/missions/[id]/route';
import { POST as postQr } from '@/app/api/qr-ul/[token]/mission-report/route';
import { auth } from '@/auth';
import { sendPushNotification } from '@/lib/push';
import { db, seedUser, seedRoles, seedUniteLocale, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedPush = vi.mocked(sendPushNotification);

type TestSession = { user: { id: string; email: string; roles: string[]; ulId: string } };
const session = (id: string, roles: string[], ulId = 'ul-18'): TestSession =>
    ({ user: { id, email: `${id}@test.com`, roles, ulId } });

const AUTHOR = session('u-author', ['CI/RPAPS']);
const OTHER_CI = session('u-other', ['CI/RPAPS']);
const RESP_18 = session('u-resp', ['RESP_MISSION']);
const RESP_4 = session('u-resp4', ['RESP_MISSION'], 'ul-4');
const ADMIN_18 = session('u-admin', ['ADMIN']);
const ADMIN_4 = session('u-admin4', ['ADMIN'], 'ul-4');
const CADRE_18 = session('u-cadre', ['CADRE']);

function asUser(s: TestSession | null) {
    mockedAuth.mockResolvedValue(s as never);
}

const basePayload = {
    mission_type: 'RESEAU',
    mission_name: 'Poste Gare du Nord',
    mission_date: '2026-03-15',
    location: 'Paris 18',
    volunteers: 'Jean',
    pegass_ok: true,
    vehicle_id: null,
    driver_id: null,
    victim_count: 2,
    presence_ul: null,
    team_dynamics: null,
    all_found_place: null,
    member_difficulties: null,
    free_comment: null,
    mission_comment: null,
    had_acr: false,
    had_hemorrhage: false,
    had_complex_care: false,
    needs_followup: false,
    volunteer_accident: false,
    volunteer_accident_details: null,
    supplies: [{ category: 'SAC_PRIMAIRE', item_name: 'Compresses', quantity_used: 2 }],
    intervention_types: [{ category: 'SOINS', quantity: 2 }],
    intervention_natures: [{ category: 'PETITS_SOINS', quantity: 2 }],
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patchRequest(id: string, body: unknown): Request {
    return new Request(`http://localhost/api/missions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function postRequest(body: unknown, url = 'http://localhost/api/missions'): Request {
    return new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function createReport(overrides: Record<string, unknown> = {}, as: TestSession = AUTHOR): Promise<string> {
    asUser(as);
    const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null, ...overrides }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    mockedPush.mockClear();
    return id as string;
}

async function editsOf(id: string) {
    const res = await db.execute({
        sql: `SELECT edited_by, edited_at, changes FROM "mission_report_edits" WHERE report_id = ? ORDER BY edited_at`,
        args: [id],
    });
    return res.rows.map(r => ({ editedBy: r.edited_by as string, changes: JSON.parse(r.changes as string) }));
}

async function reportRow(id: string) {
    const res = await db.execute({ sql: `SELECT * FROM "mission_reports" WHERE id = ?`, args: [id] });
    return res.rows[0];
}

beforeEach(async () => {
    vi.clearAllMocks();
    mockedPush.mockResolvedValue(true);
    await seedRoles();
    await seedUniteLocale({ id: 'ul-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-4', name: 'Paris 4', slug: 'paris-4' });
    await db.execute({ sql: `UPDATE "UniteLocale" SET dtCode = 'DT 75', qrToken = 'tok-18' WHERE id = 'ul-18'`, args: [] });
    for (const s of [AUTHOR, OTHER_CI, RESP_18, RESP_4, ADMIN_18, ADMIN_4, CADRE_18]) {
        await seedUser({ id: s.user.id, email: s.user.email, name: `Nom ${s.user.id}` });
    }
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/missions/[id]', () => {
    it('401 sans session', async () => {
        const id = await createReport();
        asUser(null);
        expect((await patchReport(patchRequest(id, basePayload), ctx(id))).status).toBe(401);
    });

    it('404 pour un rapport inexistant', async () => {
        asUser(ADMIN_18);
        expect((await patchReport(patchRequest('nope', basePayload), ctx('nope'))).status).toBe(404);
    });

    it('403 et rien d\'écrit : ADMIN / RESP_MISSION d\'une autre UL, cadre lecture seule, autre bénévole', async () => {
        const id = await createReport();
        for (const s of [ADMIN_4, RESP_4, CADRE_18, OTHER_CI, session('u-resp', ['RESP_MISSION', 'INACTIF'])]) {
            asUser(s);
            const res = await patchReport(patchRequest(id, { ...basePayload, mission_name: 'Piraté' }), ctx(id));
            expect(res.status, s.user.roles.join(',')).toBe(403);
        }
        expect((await reportRow(id)).mission_name).toBe('Poste Gare du Nord');
        expect(await editsOf(id)).toEqual([]);
    });

    it('400 : accident = Oui sans description', async () => {
        const id = await createReport();
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, { ...basePayload, volunteer_accident: true, volunteer_accident_details: '  ' }), ctx(id));
        expect(res.status).toBe(400);
        expect(await editsOf(id)).toEqual([]);
    });

    it('400 : corps partiel (clé omise), rien d\'écrit', async () => {
        const id = await createReport({ volunteer_accident: true, volunteer_accident_details: 'Chute' });
        asUser(AUTHOR);
        const { volunteer_accident: _omit, ...partial } = basePayload;
        void _omit;
        const res = await patchReport(patchRequest(id, { ...partial, location: 'Ailleurs' }), ctx(id));
        expect(res.status).toBe(400);
        const row = await reportRow(id);
        expect(Number(row.volunteer_accident)).toBe(1);
        expect(row.location).toBe('Paris 18');
        expect(await editsOf(id)).toEqual([]);
    });

    it('DPS / PAPS : passage refusé sans rapport signé ; autorisé avec ; rapport déjà DPS sans rapport signé modifiable', async () => {
        const reseau = await createReport();
        asUser(AUTHOR);
        let res = await patchReport(patchRequest(reseau, { ...basePayload, mission_type: 'DPS' }), ctx(reseau));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('rapport signé');
        expect((await reportRow(reseau)).mission_type).toBe('RESEAU');

        await db.execute({ sql: `UPDATE "mission_reports" SET signed_report_drive_id = 'drive-x' WHERE id = ?`, args: [reseau] });
        res = await patchReport(patchRequest(reseau, { ...basePayload, mission_type: 'PAPS' }), ctx(reseau));
        expect(res.status).toBe(200);

        const legacyDps = await createReport({ mission_type: 'DPS' });
        asUser(AUTHOR);
        res = await patchReport(patchRequest(legacyDps, { ...basePayload, mission_type: 'DPS', location: 'Corrigé' }), ctx(legacyDps));
        expect(res.status).toBe(200);
        expect((await reportRow(legacyDps)).location).toBe('Corrigé');
    });

    it('400 : répartition incohérente, rien d\'écrit', async () => {
        const id = await createReport();
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, { ...basePayload, victim_count: 3 }), ctx(id));
        expect(res.status).toBe(400);
        expect(Number((await reportRow(id)).victim_count)).toBe(2);
        expect(await editsOf(id)).toEqual([]);
    });

    it('200 auteur : 2 champs modifiés → 1 entrée à 2 changements, rattachement et auteur intacts', async () => {
        const id = await createReport();
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, {
            ...basePayload,
            location: 'Paris 18 — Barbès',
            supplies: [{ category: 'SAC_PRIMAIRE', item_name: 'Compresses', quantity_used: 4 }],
            // Ignorés : le rattachement ne se modifie pas.
            selected_ul_id: 'ul-4',
            selected_dt_code: 'DT 75',
        }), ctx(id));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, changed: true });

        const edits = await editsOf(id);
        expect(edits).toHaveLength(1);
        expect(edits[0].editedBy).toBe('u-author');
        expect(edits[0].changes).toEqual([
            { field: 'location', label: 'Lieu', old: 'Paris 18', new: 'Paris 18 — Barbès' },
            { field: 'supplies.SAC_PRIMAIRE__Compresses', label: 'Sac primaire — Compresses', old: '2', new: '4' },
        ]);

        const row = await reportRow(id);
        expect(row.location).toBe('Paris 18 — Barbès');
        expect(row.ulId).toBe('ul-18');
        expect(row.dt_code).toBeNull();
        expect(row.submitted_by).toBe('u-author');
        const supplies = await db.execute({ sql: `SELECT quantity_used FROM "mission_report_supplies" WHERE report_id = ?`, args: [id] });
        expect(supplies.rows.map(r => Number(r.quantity_used))).toEqual([4]);
    });

    it('200 RESP_MISSION et ADMIN de l\'UL : entrée à leur nom', async () => {
        const id = await createReport();
        asUser(RESP_18);
        expect((await patchReport(patchRequest(id, { ...basePayload, mission_comment: 'Revu' }), ctx(id))).status).toBe(200);
        asUser(ADMIN_18);
        expect((await patchReport(patchRequest(id, { ...basePayload, mission_comment: 'Revu 2' }), ctx(id))).status).toBe(200);
        const edits = await editsOf(id);
        expect(edits.map(e => e.editedBy)).toEqual(['u-resp', 'u-admin']);
    });

    it('PATCH sans changement réel : 200, aucune entrée, aucune notification', async () => {
        const id = await createReport({ had_acr: true });
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, { ...basePayload, had_acr: true, mission_comment: '' }), ctx(id));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ changed: false });
        expect(await editsOf(id)).toEqual([]);
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('ACR déjà vrai, accident faux → vrai : alerte ne mentionnant que l\'accident', async () => {
        const id = await createReport({ had_acr: true });
        asUser(ADMIN_18);
        const res = await patchReport(patchRequest(id, {
            ...basePayload,
            had_acr: true,
            volunteer_accident: true,
            volunteer_accident_details: 'Entorse en portant le brancard',
        }), ctx(id));
        expect(res.status).toBe(200);
        expect(mockedPush).toHaveBeenCalledTimes(1);
        const arg = mockedPush.mock.calls[0][0];
        expect(arg).toMatchObject({ roles: ['RESP_MISSION'], ulId: 'ul-18', url: `/missions/${id}`, excludeUserId: 'u-admin' });
        expect(arg.headings.fr).toBe('Incident déclaré — Poste Gare du Nord');
        expect(arg.contents.fr).toBe('Accident bénévole.');
        const row = await reportRow(id);
        expect(Number(row.volunteer_accident)).toBe(1);
        expect(row.volunteer_accident_details).toBe('Entorse en portant le brancard');
    });

    it('accident repassé à Non : description vidée, pas d\'alerte', async () => {
        const id = await createReport({ volunteer_accident: true, volunteer_accident_details: 'Chute' });
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, { ...basePayload, volunteer_accident: false, volunteer_accident_details: 'Chute' }), ctx(id));
        expect(res.status).toBe(200);
        expect((await reportRow(id)).volunteer_accident_details).toBeNull();
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('un échec de l\'alerte ne fait pas échouer l\'enregistrement', async () => {
        const id = await createReport();
        mockedPush.mockRejectedValueOnce(new Error('push down'));
        asUser(AUTHOR);
        const res = await patchReport(patchRequest(id, { ...basePayload, needs_followup: true }), ctx(id));
        expect(res.status).toBe(200);
        expect(await editsOf(id)).toHaveLength(1);
    });
});

// ── GET détail ────────────────────────────────────────────────────────────────

describe('GET /api/missions/[id] — accident, can_edit, historique', () => {
    it('rapport jamais modifié : edits vide, accident renvoyé', async () => {
        const id = await createReport({ volunteer_accident: true, volunteer_accident_details: 'Coupure' });
        asUser(AUTHOR);
        const body = await (await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).json();
        expect(body).toMatchObject({ volunteer_accident: true, volunteer_accident_details: 'Coupure', can_edit: true, edits: [] });
    });

    it('deux modifications : la plus récente d\'abord, avec nom et changements', async () => {
        const id = await createReport();
        asUser(AUTHOR);
        await patchReport(patchRequest(id, { ...basePayload, location: 'A' }), ctx(id));
        await new Promise(r => setTimeout(r, 5));
        asUser(RESP_18);
        await patchReport(patchRequest(id, { ...basePayload, location: 'B' }), ctx(id));

        const body = await (await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).json();
        expect(body.edits).toHaveLength(2);
        expect(body.edits[0]).toMatchObject({ editor_name: 'Nom u-resp', changes: [{ field: 'location', old: 'A', new: 'B' }] });
        expect(body.edits[1]).toMatchObject({ editor_name: 'Nom u-author', changes: [{ field: 'location', old: 'Paris 18', new: 'A' }] });
        expect(new Date(body.edits[0].edited_at).getTime()).toBeGreaterThanOrEqual(new Date(body.edits[1].edited_at).getTime());
    });

    it('RESP_MISSION lit les rapports de son UL (can_edit) ; pas ceux d\'une autre UL', async () => {
        const id = await createReport();
        asUser(RESP_18);
        const res = await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id));
        expect(res.status).toBe(200);
        expect((await res.json()).can_edit).toBe(true);
        asUser(RESP_4);
        expect((await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).status).toBe(403);
    });

    it('session sans utilisateur résolu : can_edit faux (le PATCH la refuserait)', async () => {
        const id = await createReport();
        mockedAuth.mockResolvedValue({ user: { roles: ['SUPER_ADMIN'], ulId: 'ul-18' } } as never);
        const res = await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id));
        expect(res.status).toBe(200);
        expect((await res.json()).can_edit).toBe(false);
        expect((await patchReport(patchRequest(id, basePayload), ctx(id))).status).toBe(403);
    });

    it('cadre de l\'UL : lecture sans droit de modifier', async () => {
        const id = await createReport();
        asUser(CADRE_18);
        const res = await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id));
        expect(res.status).toBe(200);
        expect((await res.json()).can_edit).toBe(false);
    });
});

// ── GET liste ─────────────────────────────────────────────────────────────────

describe('GET /api/missions — RESP_MISSION', () => {
    it('liste tous les rapports de son UL (scope=all)', async () => {
        await createReport({ mission_name: 'R1' });
        await createReport({ mission_name: 'R2' }, OTHER_CI);
        asUser(RESP_18);
        const res = await getList(new Request('http://localhost/api/missions?scope=all'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports.map((r: { mission_name: string }) => r.mission_name).sort()).toEqual(['R1', 'R2']);
    });

    it('ne peut toujours pas créer de rapport', async () => {
        asUser(RESP_18);
        const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null }));
        expect(res.status).toBe(403);
    });
});

// ── POST : alertes à la création ──────────────────────────────────────────────

describe('POST — alertes d\'incident', () => {
    it('hémorragie cochée : 201 + alerte aux RESP_MISSION de l\'UL', async () => {
        asUser(AUTHOR);
        const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null, had_hemorrhage: true }));
        expect(res.status).toBe(201);
        const { id } = await res.json();
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(mockedPush.mock.calls[0][0]).toMatchObject({
            roles: ['RESP_MISSION'],
            ulId: 'ul-18',
            url: `/missions/${id}`,
            contents: { fr: 'Hémorragie grave.' },
        });
    });

    it('aucune case cochée : aucune alerte', async () => {
        await createReport();
        asUser(AUTHOR);
        await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null }));
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('échec de l\'envoi push : 201 quand même', async () => {
        mockedPush.mockRejectedValueOnce(new Error('push down'));
        asUser(AUTHOR);
        const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null, had_acr: true }));
        expect(res.status).toBe(201);
    });

    it('accident = Oui sans description : 400', async () => {
        asUser(AUTHOR);
        const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null, volunteer_accident: true }));
        expect(res.status).toBe(400);
    });

    it('rapport rattaché à une DT : alerte vers l\'UL de rattachement de l\'auteur', async () => {
        await seedUserUL({ userId: 'u-author', ulId: 'ul-4', isHome: true, roles: ['CI/RPAPS'] });
        await seedUserUL({ userId: 'u-author', ulId: 'ul-18', isHome: false, roles: ['CI/RPAPS'] });
        asUser(AUTHOR);
        const res = await postCreate(postRequest({
            ...basePayload, selected_ul_id: null, selected_dt_code: 'DT 75',
            volunteer_accident: true, volunteer_accident_details: 'Chute',
        }));
        expect(res.status).toBe(201);
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(mockedPush.mock.calls[0][0]).toMatchObject({ ulId: 'ul-4', contents: { fr: 'Accident bénévole.' } });
    });

    it('livraison réelle : une notification in-app pour le RESP_MISSION de l\'UL, pas pour celui d\'une autre UL', async () => {
        const actual = await vi.importActual<typeof import('@/lib/push')>('@/lib/push');
        mockedPush.mockImplementationOnce(actual.sendPushNotification);
        await seedUserUL({ userId: 'u-resp', ulId: 'ul-18', isHome: true, roles: ['RESP_MISSION'] });
        await seedUserUL({ userId: 'u-resp4', ulId: 'ul-4', isHome: true, roles: ['RESP_MISSION'] });
        asUser(AUTHOR);
        const res = await postCreate(postRequest({ ...basePayload, selected_ul_id: 'ul-18', selected_dt_code: null, needs_followup: true }));
        expect(res.status).toBe(201);
        const notifs = await db.execute(`SELECT userId, title, message FROM "Notification"`);
        expect(notifs.rows.map(r => r.userId)).toEqual(['u-resp']);
        expect(notifs.rows[0].title).toBe('Incident déclaré — Poste Gare du Nord');
        expect(notifs.rows[0].message).toBe('Suivi nécessaire.');
    });

    it('QR d\'UL : alerte vers l\'UL du QR, échec push toléré', async () => {
        asUser(session('u-other', ['CHVL'], 'ul-4'));
        mockedPush.mockRejectedValueOnce(new Error('push down'));
        const res = await postQr(
            postRequest({ ...basePayload, had_complex_care: true }, 'http://localhost/api/qr-ul/tok-18/mission-report'),
            { params: Promise.resolve({ token: 'tok-18' }) },
        );
        expect(res.status).toBe(201);
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(mockedPush.mock.calls[0][0]).toMatchObject({ ulId: 'ul-18', contents: { fr: 'Prise en charge complexe.' } });
    });

    it('QR d\'UL sans incident : aucune alerte', async () => {
        asUser(session('u-other', ['CHVL'], 'ul-4'));
        const res = await postQr(
            postRequest(basePayload, 'http://localhost/api/qr-ul/tok-18/mission-report'),
            { params: Promise.resolve({ token: 'tok-18' }) },
        );
        expect(res.status).toBe(201);
        expect(mockedPush).not.toHaveBeenCalled();
    });
});

// ── Rapport rattaché à une DT ─────────────────────────────────────────────────

describe('Rapport DT — rapproché de l\'UL de rattachement de l\'auteur', () => {
    async function createDtReport(): Promise<string> {
        // Auteur rattaché (home) à ul-18, membre aussi de ul-4.
        await seedUserUL({ userId: 'u-author', ulId: 'ul-18', isHome: true, roles: ['CI/RPAPS'] });
        await seedUserUL({ userId: 'u-author', ulId: 'ul-4', isHome: false, roles: ['CI/RPAPS'] });
        return createReport({ selected_ul_id: null, selected_dt_code: 'DT 75' });
    }

    it('RESP_MISSION et ADMIN de l\'UL de l\'auteur : GET 200 + can_edit, PATCH 200', async () => {
        const id = await createDtReport();
        for (const s of [RESP_18, ADMIN_18]) {
            asUser(s);
            const res = await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id));
            expect(res.status, s.user.id).toBe(200);
            expect((await res.json()).can_edit).toBe(true);
            const patch = await patchReport(patchRequest(id, { ...basePayload, mission_comment: `vu par ${s.user.id}` }), ctx(id));
            expect(patch.status, s.user.id).toBe(200);
        }
        expect((await editsOf(id)).map(e => e.editedBy)).toEqual(['u-resp', 'u-admin']);
        // Le rattachement DT est intact.
        const row = await reportRow(id);
        expect(row.ulId).toBeNull();
        expect(row.dt_code).toBe('DT 75');
    });

    it('listé dans « Tous les rapports » de l\'UL de l\'auteur pour RESP_MISSION et ADMIN', async () => {
        await createDtReport();
        for (const s of [RESP_18, ADMIN_18]) {
            asUser(s);
            const body = await (await getList(new Request('http://localhost/api/missions?scope=all'))).json();
            expect(body.reports.map((r: { dt_code: string | null }) => r.dt_code), s.user.id).toEqual(['DT 75']);
        }
        // Ni pour le RESP_MISSION d'une UL où l'auteur n'est pas rattaché « home »…
        asUser(RESP_4);
        expect((await (await getList(new Request('http://localhost/api/missions?scope=all'))).json()).reports).toEqual([]);
        // …ni pour le cadre de l'UL de l'auteur.
        asUser(CADRE_18);
        expect((await (await getList(new Request('http://localhost/api/missions?scope=all'))).json()).reports).toEqual([]);
    });

    it('RESP_MISSION d\'une autre UL : 403 ; CADRE de l\'UL de l\'auteur : 403', async () => {
        const id = await createDtReport();
        asUser(RESP_4);
        expect((await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).status).toBe(403);
        expect((await patchReport(patchRequest(id, { ...basePayload, mission_comment: 'x' }), ctx(id))).status).toBe(403);
        asUser(CADRE_18);
        expect((await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).status).toBe(403);
        expect(await editsOf(id)).toEqual([]);
    });
});

// ── DELETE et nom figé de l'éditeur ───────────────────────────────────────────

describe('DELETE /api/missions/[id] — historique', () => {
    it('supprime aussi les entrées d\'historique du rapport, pas celles des autres', async () => {
        const id = await createReport();
        const keep = await createReport({ mission_name: 'Autre' });
        asUser(AUTHOR);
        await patchReport(patchRequest(id, { ...basePayload, location: 'A' }), ctx(id));
        await patchReport(patchRequest(keep, { ...basePayload, mission_name: 'Autre', location: 'B' }), ctx(keep));

        asUser(ADMIN_18);
        // Comme en production (aucun PRAGMA foreign_keys) : le CASCADE ne s'exécute pas,
        // seule la suppression explicite de la route vide l'historique.
        await db.execute('PRAGMA foreign_keys = OFF');
        try {
            const res = await deleteReport(new Request(`http://localhost/api/missions/${id}`, { method: 'DELETE' }), ctx(id));
            expect(res.status).toBe(200);
        } finally {
            await db.execute('PRAGMA foreign_keys = ON');
        }
        expect(await editsOf(id)).toEqual([]);
        expect(await editsOf(keep)).toHaveLength(1);
    });
});

describe('Nom de l\'éditeur figé', () => {
    it('reste affiché après suppression ou renommage du compte', async () => {
        const id = await createReport();
        asUser(RESP_18);
        await patchReport(patchRequest(id, { ...basePayload, location: 'A' }), ctx(id));
        asUser(ADMIN_18);
        await new Promise(r => setTimeout(r, 5));
        await patchReport(patchRequest(id, { ...basePayload, location: 'B' }), ctx(id));

        // Production : clés étrangères non activées, la suppression du compte passe.
        await db.execute('PRAGMA foreign_keys = OFF');
        await db.execute(`DELETE FROM "User" WHERE id = 'u-resp'`);
        await db.execute('PRAGMA foreign_keys = ON');
        await db.execute(`UPDATE "User" SET name = 'Renommé' WHERE id = 'u-admin'`);

        asUser(AUTHOR);
        const body = await (await getDetail(new Request(`http://localhost/api/missions/${id}`), ctx(id))).json();
        expect(body.edits.map((e: { editor_name: string }) => e.editor_name)).toEqual(['Nom u-admin', 'Nom u-resp']);
    });
});
