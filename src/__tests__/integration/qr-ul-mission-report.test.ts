/**
 * Tests d'intégration — POST /api/qr-ul/[token]/mission-report.
 *
 * Cœur de la feature : le dépôt d'un compte rendu par SCAN, sans aucun filtre de
 * rôle. Trois invariants sont épinglés ici parce qu'un contributeur ultérieur
 * pourrait « harmoniser » cette route avec `/api/missions` et les casser :
 *   1. un bénévole sans rôle attribué réussit (là où `/api/missions` le refuse) ;
 *   2. le rattachement vient du TOKEN, jamais du payload ;
 *   3. `/api/missions` garde, lui, son contrôle de rôles intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST } from '@/app/api/qr-ul/[token]/mission-report/route';
import { POST as postClassic } from '@/app/api/missions/route';
import { DELETE as regenerateToken } from '@/app/api/ul/[id]/qr-token/route';
import { auth } from '@/auth';
import { db, seedUser, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

const TOKEN = 'token-ul-paris-18';

const SANS_ROLE = { user: { id: 'u-nobody', email: 'nobody@test.com', name: 'Sans Rôle', ulId: 'ul-lyon', roles: [] } };
const CHVL = { user: { id: 'u-chvl', email: 'chvl@test.com', name: 'Camille', ulId: 'ul-lyon', roles: ['CHVL'] } };
const INACTIF = { user: { id: 'u-off', email: 'off@test.com', name: 'Inès', ulId: 'ul-paris-18', roles: ['INACTIF', 'CHVL'] } };
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', name: 'Alex', ulId: 'ul-paris-18', roles: ['ADMIN'] } };

const basePayload = {
    mission_type: 'RESEAU',
    mission_name: 'Poste Secours Gare du Nord',
    mission_date: '2026-03-15',
    location: 'Paris 18',
    volunteers: 'Moi, Jean Dupont',
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
    supplies: [
        { category: 'SAC_PRIMAIRE', item_name: "Gants d'examen (paire)", quantity_used: 4 },
        { category: 'SAC_PRIMAIRE', item_name: 'Compresses stériles 10x10', quantity_used: 0 },
    ],
    intervention_types: [
        { category: 'SOINS', quantity: 1 },
        { category: 'EVAC_CRF', quantity: 1 },
    ],
    intervention_natures: [
        { category: 'PETITS_SOINS', quantity: 2 },
    ],
};

function makeRequest(body: Record<string, unknown>, token = TOKEN): Request {
    return new Request(`http://localhost/api/qr-ul/${token}/mission-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function withToken(token = TOKEN) {
    return { params: Promise.resolve({ token }) };
}

async function reportRow(id: string) {
    const res = await db.execute({
        sql: `SELECT ulId, dt_code, submitted_by, victim_count FROM "mission_reports" WHERE id = ?`,
        args: [id],
    });
    return res.rows[0];
}

async function countReports(): Promise<number> {
    const res = await db.execute(`SELECT COUNT(*) AS c FROM "mission_reports"`);
    return Number(res.rows[0].c);
}

beforeEach(async () => {
    await db.execute(`DELETE FROM "mission_report_interventions"`);
    await db.execute(`DELETE FROM "mission_report_supplies"`);
    await db.execute(`DELETE FROM "mission_reports"`);
    await db.execute(`DELETE FROM "UniteLocale"`);

    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
    await db.execute({
        sql: `UPDATE "UniteLocale" SET qrToken = ?, dtCode = ? WHERE id = ?`,
        args: [TOKEN, 'DT 75', 'ul-paris-18'],
    });

    await seedUser({ id: 'u-nobody', email: 'nobody@test.com', name: 'Sans Rôle' });
    await seedUser({ id: 'u-chvl', email: 'chvl@test.com', name: 'Camille' });
    await seedUser({ id: 'u-off', email: 'off@test.com', name: 'Inès' });
    await seedUser({ id: 'u-admin', email: 'admin@test.com', name: 'Alex' });

    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue(SANS_ROLE as never);
});

describe('POST /api/qr-ul/[token]/mission-report — accès', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await POST(makeRequest(basePayload), withToken());
        expect(res.status).toBe(401);
        expect(await countReports()).toBe(0);
    });

    it('retourne 403 « Compte inactif » pour un compte bloqué, sans rien écrire', async () => {
        mockedAuth.mockResolvedValue(INACTIF as never);
        const res = await POST(makeRequest(basePayload), withToken());
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('Compte inactif');
        expect(await countReports()).toBe(0);
    });

    it('retourne 404 pour un token inconnu, sans rien écrire', async () => {
        const res = await POST(makeRequest(basePayload, 'inconnu'), withToken('inconnu'));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('QR Code invalide ou expiré');
        expect(await countReports()).toBe(0);
    });

    it('retourne 400 sur un payload invalide (Zod)', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omission volontaire de mission_name pour déclencher la validation
        const { mission_name, ...sansNom } = basePayload;
        const res = await POST(makeRequest(sansNom), withToken());
        expect(res.status).toBe(400);
        expect(await countReports()).toBe(0);
    });
});

describe('POST /api/qr-ul/[token]/mission-report — dépôt', () => {
    it('crée le rapport pour un bénévole SANS aucun rôle (le cœur de la feature)', async () => {
        const res = await POST(makeRequest(basePayload), withToken());

        expect(res.status).toBe(201);
        const { id } = await res.json();
        const row = await reportRow(id);
        expect(row.ulId).toBe('ul-paris-18');
        expect(row.dt_code).toBeNull();
        expect(row.submitted_by).toBe('u-nobody');
        expect(Number(row.victim_count)).toBe(2);
    });

    it('crée le rapport pour un CHVL via le endpoint QR (sans filtre de rôle)', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        const res = await POST(makeRequest(basePayload), withToken());
        expect(res.status).toBe(201);
    });

    it('insère consommables (>0 seulement) et répartition dans la même transaction', async () => {
        const { id } = await (await POST(makeRequest(basePayload), withToken())).json();

        const supplies = await db.execute({
            sql: `SELECT item_name, quantity_used FROM "mission_report_supplies" WHERE report_id = ?`,
            args: [id],
        });
        expect(supplies.rows).toHaveLength(1);
        expect(supplies.rows[0].item_name).toBe("Gants d'examen (paire)");

        const interventions = await db.execute({
            sql: `SELECT breakdown, category, quantity FROM "mission_report_interventions" WHERE report_id = ? ORDER BY breakdown, category`,
            args: [id],
        });
        expect(interventions.rows.map(r => [r.breakdown, r.category, Number(r.quantity)])).toEqual([
            ['MODE', 'EVAC_CRF', 1],
            ['MODE', 'SOINS', 1],
            ['NATURE', 'PETITS_SOINS', 2],
        ]);
    });

    /** Le client ne choisit JAMAIS le rattachement : le token en décide seul. */
    it('ignore un `selected_ul_id` falsifié et rattache l\'UL du token', async () => {
        const res = await POST(
            makeRequest({ ...basePayload, selected_ul_id: 'ul-lyon' }),
            withToken(),
        );

        expect(res.status).toBe(201);
        const { id } = await res.json();
        expect((await reportRow(id)).ulId).toBe('ul-paris-18');
    });

    it('ignore un `selected_dt_code` falsifié : `dt_code` reste NULL', async () => {
        const res = await POST(
            makeRequest({ ...basePayload, selected_ul_id: null, selected_dt_code: 'DT 75' }),
            withToken(),
        );

        expect(res.status).toBe(201);
        const row = await reportRow((await res.json()).id);
        expect(row.ulId).toBe('ul-paris-18');
        expect(row.dt_code).toBeNull();
    });

    it('refuse en 404 l\'ancien token après régénération', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        await regenerateToken(
            new Request('http://localhost/api/ul/ul-paris-18/qr-token', { method: 'DELETE' }),
            { params: Promise.resolve({ id: 'ul-paris-18' }) },
        );

        mockedAuth.mockResolvedValue(SANS_ROLE as never);
        const res = await POST(makeRequest(basePayload), withToken());

        expect(res.status).toBe(404);
        expect(await countReports()).toBe(0);
    });
});

/**
 * Garde-fou de non-régression : la route classique ne doit RIEN emprunter au
 * bypass QR. Son contrôle de rôles est inchangé par l'extraction de
 * `insertMissionReport`.
 */
describe('POST /api/missions reste fermé aux rôles non autorisés', () => {
    function makeClassicRequest(body: Record<string, unknown>): Request {
        return new Request('http://localhost/api/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    it('refuse en 403 le bénévole sans rôle qui réussit pourtant via le QR', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE as never);
        const res = await postClassic(makeClassicRequest({ ...basePayload, selected_ul_id: 'ul-paris-18' }));
        expect(res.status).toBe(403);
        expect(await countReports()).toBe(0);
    });

    it('refuse en 403 un CHVL', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        const res = await postClassic(makeClassicRequest({ ...basePayload, selected_ul_id: 'ul-paris-18' }));
        expect(res.status).toBe(403);
    });

    it('accepte un ADMIN et respecte le rattachement libre du payload (DT incluse)', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await postClassic(makeClassicRequest({
            ...basePayload,
            selected_ul_id: null,
            selected_dt_code: 'DT 75',
        }));

        expect(res.status).toBe(201);
        const row = await reportRow((await res.json()).id);
        expect(row.ulId).toBeNull();
        expect(row.dt_code).toBe('DT 75');
    });
});
