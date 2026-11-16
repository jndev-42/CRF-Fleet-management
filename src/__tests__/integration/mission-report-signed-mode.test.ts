/**
 * Tests d'intégration — mode du rapport signé DPS/PAPS (photo / signé dans l'appli / aucun).
 *
 * Couvre POST /api/missions et POST /api/qr-ul/[token]/mission-report :
 *   - 401, 403, 400 (Zod) ;
 *   - PHOTO : fichier requis, mode stocké ;
 *   - APP : PDF généré et écrit sur R2 AVANT l'INSERT, clé rangée par UL, champs requis, 500 sans INSERT si R2 échoue ;
 *   - NONE : ni fichier ni signatures ;
 *   - RESEAU : mode NULL, champs DPS/PAPS ignorés ;
 * et GET /api/missions/[id] (mode et champs relus).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/r2', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/r2')>()),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
}));

import { POST as postClassic } from '@/app/api/missions/route';
import { GET as getDetail } from '@/app/api/missions/[id]/route';
import { POST as postQr } from '@/app/api/qr-ul/[token]/mission-report/route';
import { auth } from '@/auth';
import { putObject, deleteObject } from '@/lib/r2';
import { isAcceptableMediaRef } from '@/lib/media/refs';
import { db, seedUser, seedUniteLocale, seedRoles } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedPut = vi.mocked(putObject);

const ADMIN = { user: { id: 'user-admin', email: 'admin@test.com', name: 'Alex', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18' } };
const GUEST = { user: { id: 'user-guest', email: 'guest@test.com', roles: ['GUEST'], ulId: 'ul-paris-18' } };
const SANS_ROLE = { user: { id: 'user-nobody', email: 'nobody@test.com', name: 'Sans Rôle', roles: [], ulId: 'ul-lyon' } };

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const signature = (name: string) => ({ image: PNG, signed_at: '2026-11-16T13:32:00.000Z', name, function_title: 'Fonction' });
const APP_REPORT = { team_signature: signature('Alice'), organizer_signature: signature('Bob') };

const base = {
    selected_ul_id: 'ul-paris-18',
    selected_dt_code: null,
    mission_type: 'DPS',
    mission_name: 'Poste Secours Test',
    mission_date: '2026-03-15',
    location: 'Paris 18',
    volunteers: 'Moi',
    pegass_ok: true,
    vehicle_id: null,
    driver_id: null,
    victim_count: 2,
    had_acr: false,
    had_hemorrhage: false,
    had_complex_care: false,
    needs_followup: false,
    supplies: [],
    intervention_types: [{ category: 'SOINS', quantity: 2 }],
    intervention_natures: [{ category: 'PETITS_SOINS', quantity: 2 }],
};

const dpsFields = {
    start_time: '08:00', end_time: '18:00', arrival_time: '07:30', departure_time: '18:30',
    mission_lead_name: 'Alice Martin', mission_lead_phone: '0612345678',
};

const appPayload = {
    ...base, ...dpsFields,
    signed_report_mode: 'APP',
    organizer_name: 'Bob Durand', organizer_function: 'Président',
    crf_observations: 'RAS', organizer_observations: 'Merci',
    app_report: APP_REPORT,
};

const signedKey = 'mission-report-photo/paris-18/poste-secours-test-20261108-143000-c3d4/0a1b2c3d-rapport.pdf';

function req(body: Record<string, unknown>, url = 'http://localhost/api/missions'): Request {
    return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const qrReq = (body: Record<string, unknown>) => req(body, 'http://localhost/api/qr-ul/tok-18/mission-report');
const qrCtx = { params: Promise.resolve({ token: 'tok-18' }) };

async function row(id: string) {
    return (await db.execute({ sql: `SELECT * FROM "mission_reports" WHERE id = ?`, args: [id] })).rows[0];
}
async function count() {
    return Number((await db.execute(`SELECT COUNT(*) AS c FROM "mission_reports"`)).rows[0].c);
}

beforeEach(async () => {
    vi.clearAllMocks();
    mockedPut.mockResolvedValue(undefined);
    await db.execute(`DELETE FROM "mission_report_interventions"`);
    await db.execute(`DELETE FROM "mission_report_supplies"`);
    await db.execute(`DELETE FROM "mission_reports"`);
    await seedRoles();
    await seedUser({ id: 'user-admin', email: 'admin@test.com', name: 'Alex' });
    await seedUser({ id: 'user-nobody', email: 'nobody@test.com', name: 'Sans Rôle' });
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
    await db.execute({ sql: `UPDATE "UniteLocale" SET qrToken = ? WHERE id = ?`, args: ['tok-18', 'ul-paris-18'] });
    mockedAuth.mockResolvedValue(ADMIN as never);
});

describe('POST /api/missions — accès', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await postClassic(req(appPayload))).status).toBe(401);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('403 pour un rôle non autorisé, sans PDF généré', async () => {
        mockedAuth.mockResolvedValue(GUEST as never);
        expect((await postClassic(req(appPayload))).status).toBe(403);
        expect(mockedPut).not.toHaveBeenCalled();
    });
});

describe('POST /api/missions — mode PHOTO', () => {
    it('201 avec fichier : mode PHOTO, clé conservée, aucun PDF généré', async () => {
        const res = await postClassic(req({ ...base, signed_report_mode: 'PHOTO', signed_report_drive_id: signedKey }));
        expect(res.status).toBe(201);
        const r = await row((await res.json()).id);
        expect(r.signed_report_mode).toBe('PHOTO');
        expect(r.signed_report_drive_id).toBe(signedKey);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('400 sans fichier', async () => {
        const res = await postClassic(req({ ...base, signed_report_mode: 'PHOTO' }));
        expect(res.status).toBe(400);
        expect(await count()).toBe(0);
    });

    it('rétrocompatible : sans mode mais avec fichier, déduit PHOTO', async () => {
        const res = await postClassic(req({ ...base, signed_report_drive_id: signedKey }));
        expect(res.status).toBe(201);
        expect((await row((await res.json()).id)).signed_report_mode).toBe('PHOTO');
    });
});

describe('POST /api/missions — mode APP', () => {
    it('201 : PDF écrit sur R2 sous mission-report-photo/<UL>/…, référencé par signed_report_drive_id', async () => {
        const res = await postClassic(req(appPayload));
        expect(res.status).toBe(201);
        const r = await row((await res.json()).id);

        expect(mockedPut).toHaveBeenCalledTimes(1);
        const [key, body, contentType] = mockedPut.mock.calls[0];
        expect(key).toMatch(/^mission-report-photo\/paris-18\/poste-secours-test-\d{8}-\d{6}-[0-9a-f]{4}\/[0-9a-z]{8}-rapport-de-mission\.pdf$/);
        expect(isAcceptableMediaRef(key, 'mission-report-photo', 'file')).toBe(true);
        expect(Buffer.from(body).subarray(0, 5).toString()).toBe('%PDF-');
        expect(contentType).toBe('application/pdf');

        expect(r.signed_report_drive_id).toBe(key);
        expect(r.signed_report_mode).toBe('APP');
        expect(r).toMatchObject({
            start_time: '08:00', end_time: '18:00', arrival_time: '07:30', departure_time: '18:30',
            mission_lead_name: 'Alice Martin', mission_lead_phone: '0612345678',
            crf_observations: 'RAS', organizer_observations: 'Merci',
            organizer_name: 'Bob Durand', organizer_function: 'Président',
        });
    });

    it('les images de signature ne sont jamais stockées en base', async () => {
        const res = await postClassic(req(appPayload));
        const r = await row((await res.json()).id);
        expect(JSON.stringify(Object.values(r))).not.toContain('iVBORw0KGgo');
    });

    it.each([
        ['signatures absentes', { app_report: null }],
        ['signature de l’organisateur absente', { app_report: { team_signature: signature('Alice') } }],
        ['image non PNG', { app_report: { ...APP_REPORT, team_signature: { ...signature('Alice'), image: 'data:image/jpeg;base64,AAAA' } } }],
        ['heure de début manquante', { start_time: null }],
        ['heure invalide', { end_time: '25:61' }],
        ['responsable manquant', { mission_lead_name: '' }],
        ['téléphone manquant', { mission_lead_phone: null }],
        ['nom de l’organisateur manquant', { organizer_name: null }],
        ['fonction de l’organisateur manquante', { organizer_function: '  ' }],
        ['fichier joint avec le mode APP', { signed_report_drive_id: signedKey }],
    ])('400 : %s', async (_label, override) => {
        const res = await postClassic(req({ ...appPayload, ...override }));
        expect(res.status).toBe(400);
        expect(await count()).toBe(0);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('500 sans INSERT si l’écriture R2 échoue', async () => {
        mockedPut.mockRejectedValueOnce(new Error('R2 indisponible'));
        const res = await postClassic(req(appPayload));
        expect(res.status).toBe(500);
        expect(await count()).toBe(0);
    });

    it('nettoie le PDF R2 si l\u2019ouverture de la transaction échoue après l\u2019écriture', async () => {
        const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('transaction indisponible'));
        const res = await postClassic(req(appPayload));
        spy.mockRestore();
        expect(res.status).toBe(500);
        expect(await count()).toBe(0);
        expect(mockedPut).toHaveBeenCalledTimes(1);
        expect(vi.mocked(deleteObject)).toHaveBeenCalledWith(mockedPut.mock.calls[0][0]);
    });

    it('PAPS : même parcours', async () => {
        const res = await postClassic(req({ ...appPayload, mission_type: 'PAPS' }));
        expect(res.status).toBe(201);
        expect((await row((await res.json()).id)).mission_type).toBe('PAPS');
    });

    it('GET /api/missions/[id] relit le mode et les champs', async () => {
        const created = await (await postClassic(req(appPayload))).json();
        const detail = await (await getDetail(new Request(`http://localhost/api/missions/${created.id}`), { params: Promise.resolve({ id: created.id }) })).json();
        expect(detail).toMatchObject({
            signed_report_mode: 'APP', start_time: '08:00', mission_lead_name: 'Alice Martin',
            organizer_name: 'Bob Durand', crf_observations: 'RAS',
        });
        expect(detail.signed_report_drive_id).toBe(mockedPut.mock.calls[0][0]);
    });
});

describe('POST /api/missions — mode NONE et RESEAU', () => {
    it('201 NONE : ni clé ni signature, horaires facultatifs conservés', async () => {
        const res = await postClassic(req({ ...base, signed_report_mode: 'NONE', start_time: '09:00' }));
        expect(res.status).toBe(201);
        const r = await row((await res.json()).id);
        expect(r.signed_report_mode).toBe('NONE');
        expect(r.signed_report_drive_id).toBeNull();
        expect(r.start_time).toBe('09:00');
        expect(r.organizer_name).toBeNull();
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('400 NONE avec fichier ou signatures', async () => {
        expect((await postClassic(req({ ...base, signed_report_mode: 'NONE', signed_report_drive_id: signedKey }))).status).toBe(400);
        expect((await postClassic(req({ ...base, signed_report_mode: 'NONE', app_report: APP_REPORT }))).status).toBe(400);
    });

    it('400 sans mode ni fichier (DPS/PAPS) : le mode doit être choisi', async () => {
        const res = await postClassic(req(base));
        expect(res.status).toBe(400);
        expect(await count()).toBe(0);
    });

    it('RESEAU : mode NULL, champs DPS/PAPS et signatures ignorés', async () => {
        const res = await postClassic(req({ ...appPayload, mission_type: 'RESEAU', signed_report_mode: 'APP' }));
        expect(res.status).toBe(201);
        const r = await row((await res.json()).id);
        expect(r.signed_report_mode).toBeNull();
        expect(r.start_time).toBeNull();
        expect(r.mission_lead_name).toBeNull();
        expect(r.organizer_name).toBeNull();
        expect(r.signed_report_drive_id).toBeNull();
        expect(mockedPut).not.toHaveBeenCalled();
    });
});

describe('POST /api/qr-ul/[token]/mission-report — mêmes règles', () => {
    beforeEach(() => mockedAuth.mockResolvedValue(SANS_ROLE as never));

    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await postQr(qrReq(appPayload), qrCtx)).status).toBe(401);
    });

    it('400 : mode APP sans signatures', async () => {
        const res = await postQr(qrReq({ ...appPayload, app_report: null }), qrCtx);
        expect(res.status).toBe(400);
        expect(await count()).toBe(0);
    });

    it('201 APP : PDF rangé sous l’UL du QR, même si le payload en désigne une autre', async () => {
        const res = await postQr(qrReq({ ...appPayload, selected_ul_id: 'ul-lyon' }), qrCtx);
        expect(res.status).toBe(201);
        const r = await row((await res.json()).id);
        expect(r.ulId).toBe('ul-paris-18');
        expect(mockedPut.mock.calls[0][0]).toMatch(/^mission-report-photo\/paris-18\//);
        expect(r.signed_report_mode).toBe('APP');
    });

    it('201 NONE et 201 PHOTO', async () => {
        const none = await postQr(qrReq({ ...base, signed_report_mode: 'NONE' }), qrCtx);
        expect(none.status).toBe(201);
        expect((await row((await none.json()).id)).signed_report_mode).toBe('NONE');
        const photo = await postQr(qrReq({ ...base, signed_report_mode: 'PHOTO', signed_report_drive_id: signedKey }), qrCtx);
        expect(photo.status).toBe(201);
        expect((await row((await photo.json()).id)).signed_report_mode).toBe('PHOTO');
    });

    it('500 sans INSERT si R2 échoue', async () => {
        mockedPut.mockRejectedValueOnce(new Error('R2 indisponible'));
        expect((await postQr(qrReq(appPayload), qrCtx)).status).toBe(500);
        expect(await count()).toBe(0);
    });
});
