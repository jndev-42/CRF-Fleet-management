/**
 * Tests unitaires — modification après envoi des comptes rendus de mission :
 *   - diffMissionReport (champs scalaires, consommables, répartition, libellés)
 *   - incidentFlags / newlyRaisedFlags (alertes)
 *   - canEditMissionReport (droit de modifier)
 *   - updateMissionReportSchema (accident bénévole)
 *   - reportToWizardState (pré-remplissage du wizard)
 */
import { describe, it, expect, vi } from 'vitest';
import type { Session } from 'next-auth';

// access.ts importe le client DB (resolveSessionUserId) : neutralisé, jamais appelé ici.
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn(), transaction: vi.fn() } }));
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn() }));

import { diffMissionReport, type MissionReportSnapshot } from '@/lib/missions/update-mission-report';
import { incidentFlags, newlyRaisedFlags } from '@/lib/missions/incident-alert';
import { canEditMissionReport, canReadMissionReport } from '@/lib/missions/access';
import { updateMissionReportSchema, createMissionReportSchema, accidentDetailsToStore } from '@/lib/missions/create-mission-report';
import { reportToWizardState } from '@/lib/missions/edit-form';

function snapshot(overrides: Partial<MissionReportSnapshot> = {}): MissionReportSnapshot {
    return {
        mission_type: 'DPS',
        mission_name: 'Match',
        mission_date: '2026-03-15',
        location: 'Stade',
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
        supplies: { 'SAC_PRIMAIRE__Compresses': 2 },
        intervention_types: { SOINS: 2 },
        intervention_natures: { PETITS_SOINS: 2 },
        ...overrides,
    };
}

describe('diffMissionReport', () => {
    it('états identiques : aucune modification', () => {
        expect(diffMissionReport(snapshot(), snapshot())).toEqual([]);
    });

    it('texte vide et null sont équivalents', () => {
        expect(diffMissionReport(snapshot({ mission_comment: null }), snapshot({ mission_comment: '' }))).toEqual([]);
    });

    it('rend les valeurs en libellés lisibles (Oui/Non, type, date, dynamique)', () => {
        const changes = diffMissionReport(
            snapshot(),
            snapshot({ had_acr: true, mission_type: 'PAPS', mission_date: '2026-03-16', team_dynamics: 'BIEN' }),
        );
        expect(changes).toEqual(expect.arrayContaining([
            { field: 'had_acr', label: 'Arrêt cardio-respiratoire (ACR)', old: 'Non', new: 'Oui' },
            { field: 'mission_type', label: 'Type de mission', old: 'DPS', new: 'PAPS' },
            { field: 'mission_date', label: 'Date', old: '15/03/2026', new: '16/03/2026' },
            expect.objectContaining({ field: 'team_dynamics', old: '—' }),
        ]));
        expect(changes).toHaveLength(4);
    });

    it('véhicule et conducteur rendus par leur nom ; véhicule extérieur par son libellé', () => {
        const changes = diffMissionReport(
            snapshot({ vehicle_id: 'v1', driver_id: 'u1' }),
            snapshot({ vehicle_id: 'EXTERNAL_VL', driver_id: 'u2' }),
            { vehicles: { v1: 'VPSP 18-01' }, drivers: { u1: 'Alice', u2: 'Bruno' } },
        );
        expect(changes).toEqual([
            { field: 'vehicle_id', label: 'Véhicule', old: 'VPSP 18-01', new: 'VL extérieure' },
            { field: 'driver_id', label: 'Chauffeur', old: 'Alice', new: 'Bruno' },
        ]);
    });

    it('consommables : modification, ajout 0 → n, retrait n → 0, avec la catégorie', () => {
        const changes = diffMissionReport(
            snapshot({ supplies: { 'SAC_PRIMAIRE__Compresses': 2, 'BRULURE__Gel': 1 } }),
            snapshot({ supplies: { 'SAC_PRIMAIRE__Compresses': 4, 'HYGIENE__Gants': 3 } }),
        );
        expect(changes).toEqual([
            { field: 'supplies.BRULURE__Gel', label: expect.stringContaining('Gel'), old: '1', new: '0' },
            { field: 'supplies.HYGIENE__Gants', label: expect.stringContaining('Gants'), old: '0', new: '3' },
            { field: 'supplies.SAC_PRIMAIRE__Compresses', label: 'Sac primaire — Compresses', old: '2', new: '4' },
        ]);
    });

    it('répartition des interventions comparée par catégorie, libellée', () => {
        const changes = diffMissionReport(
            snapshot(),
            snapshot({ intervention_types: { SOINS: 1, EVAC_CRF: 1 } }),
        );
        expect(changes.map(c => c.field)).toEqual(['intervention_types.EVAC_CRF', 'intervention_types.SOINS']);
        expect(changes[1]).toMatchObject({ old: '2', new: '1' });
        expect(changes[1].label).toMatch(/^Répartition par type — /);
    });

    it('accident bénévole et sa description', () => {
        const changes = diffMissionReport(
            snapshot(),
            snapshot({ volunteer_accident: true, volunteer_accident_details: 'Entorse' }),
        );
        expect(changes).toEqual([
            { field: 'volunteer_accident', label: 'Accident bénévole', old: 'Non', new: 'Oui' },
            { field: 'volunteer_accident_details', label: 'Description de l\'accident', old: '—', new: 'Entorse' },
        ]);
    });
});

describe('incidentFlags / newlyRaisedFlags', () => {
    it('incidentFlags liste les cases cochées dans l\'ordre d\'affichage', () => {
        expect(incidentFlags({ had_hemorrhage: true, volunteer_accident: true, needs_followup: false })).toEqual(['volunteer_accident', 'had_hemorrhage']);
        expect(incidentFlags({})).toEqual([]);
    });

    it('newlyRaisedFlags ne garde que les passages de faux à vrai', () => {
        expect(newlyRaisedFlags(
            { had_acr: true, volunteer_accident: false },
            { had_acr: true, volunteer_accident: true },
        )).toEqual(['volunteer_accident']);
        expect(newlyRaisedFlags({ had_acr: true }, { had_acr: false })).toEqual([]);
        expect(newlyRaisedFlags({ needs_followup: true }, { needs_followup: true })).toEqual([]);
    });
});

describe('canEditMissionReport', () => {
    const session = (roles: string[], ulId = 'ul-18') => ({ user: { id: 'me', roles, ulId } }) as unknown as Session;
    const ownReport = { ulId: 'ul-18', submittedBy: 'me' };
    const otherReport = { ulId: 'ul-18', submittedBy: 'someone' };

    it('SUPER_ADMIN : tous, même d\'une autre UL ou rattachés à une DT', () => {
        expect(canEditMissionReport(session(['SUPER_ADMIN'], 'ul-4'), otherReport, 'me')).toBe(true);
        expect(canEditMissionReport(session(['SUPER_ADMIN']), { ulId: null, submittedBy: 'x' }, 'me')).toBe(true);
    });

    it('ADMIN et RESP_MISSION : ceux de l\'UL active seulement', () => {
        for (const role of ['ADMIN', 'RESP_MISSION']) {
            expect(canEditMissionReport(session([role]), otherReport, 'me'), role).toBe(true);
            expect(canEditMissionReport(session([role], 'ul-4'), otherReport, 'me'), role).toBe(false);
            expect(canEditMissionReport(session([role]), { ulId: null, submittedBy: 'x' }, 'me'), role).toBe(false);
        }
    });

    it('auteur : le sien tant qu\'il est contributeur ou admin', () => {
        expect(canEditMissionReport(session(['CI/RPAPS']), ownReport, 'me')).toBe(true);
        expect(canEditMissionReport(session(['CHVL'], 'ul-4'), ownReport, 'me')).toBe(true);
        expect(canEditMissionReport(session(['CI/RPAPS']), otherReport, 'me')).toBe(false);
        // A perdu ses rôles de contributeur : plus de modification.
        expect(canEditMissionReport(session(['CADRE']), ownReport, 'me')).toBe(false);
        expect(canEditMissionReport(session([]), ownReport, 'me')).toBe(false);
    });

    it('cadre / président (lecture seule) : jamais', () => {
        expect(canEditMissionReport(session(['CADRE']), otherReport, 'me')).toBe(false);
        expect(canEditMissionReport(session(['PRESIDENT']), otherReport, 'me')).toBe(false);
    });

    it('rapport DT : rapproché de l\'UL de rattachement de l\'auteur pour ADMIN / RESP_MISSION seulement', () => {
        const dtReport = { ulId: null, submittedBy: 'someone', authorHomeUlId: 'ul-18' };
        for (const role of ['ADMIN', 'RESP_MISSION']) {
            expect(canEditMissionReport(session([role]), dtReport, 'me'), role).toBe(true);
            expect(canReadMissionReport(session([role]), dtReport, 'me'), role).toBe(true);
            expect(canEditMissionReport(session([role], 'ul-4'), dtReport, 'me'), role).toBe(false);
            expect(canReadMissionReport(session([role], 'ul-4'), dtReport, 'me'), role).toBe(false);
        }
        for (const role of ['CADRE', 'PRESIDENT']) {
            expect(canReadMissionReport(session([role]), dtReport, 'me'), role).toBe(false);
            expect(canEditMissionReport(session([role]), dtReport, 'me'), role).toBe(false);
        }
        // Auteur sans UL de rattachement : aucun rapprochement.
        expect(canReadMissionReport(session(['ADMIN']), { ulId: null, submittedBy: 'x', authorHomeUlId: null }, 'me')).toBe(false);
    });

    it('ulId « default » vaut « sans UL » : jamais rapproché de l\'UL « default » de la session', () => {
        const legacy = { ulId: 'default', submittedBy: 'someone' };
        expect(canReadMissionReport(session(['ADMIN'], 'default'), legacy, 'me')).toBe(false);
        expect(canReadMissionReport(session(['CADRE'], 'default'), legacy, 'me')).toBe(false);
        expect(canEditMissionReport(session(['RESP_MISSION'], 'default'), legacy, 'me')).toBe(false);
        // Comme un rapport DT : rapproché de l'UL de rattachement de l'auteur.
        expect(canEditMissionReport(session(['RESP_MISSION']), { ...legacy, authorHomeUlId: 'ul-18' }, 'me')).toBe(true);
    });

    it('INACTIF bloque tout, même cumulé', () => {
        expect(canEditMissionReport(session(['SUPER_ADMIN', 'INACTIF']), otherReport, 'me')).toBe(false);
        expect(canEditMissionReport(session(['RESP_MISSION', 'INACTIF']), otherReport, 'me')).toBe(false);
        expect(canEditMissionReport(session(['CI/RPAPS', 'INACTIF']), ownReport, 'me')).toBe(false);
    });
});

describe('Zod — accident bénévole', () => {
    // Corps complet : le PATCH remplace tout le contenu, chaque clé est obligatoire.
    const base = {
        mission_type: 'RESEAU', mission_name: 'M', mission_date: '2026-03-15', location: 'L',
        volunteers: 'Jean', pegass_ok: true, vehicle_id: null, driver_id: null, victim_count: 0,
        presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
        free_comment: null, mission_comment: null,
        had_acr: false, had_hemorrhage: false, had_complex_care: false, needs_followup: false,
        volunteer_accident: false, volunteer_accident_details: null,
        supplies: [], intervention_types: [], intervention_natures: [],
    };

    it('accident = Oui sans description : refusé (création et modification)', () => {
        for (const details of [undefined, null, '', '   ']) {
            const payload = { ...base, volunteer_accident: true, volunteer_accident_details: details };
            expect(updateMissionReportSchema.safeParse(payload).success).toBe(false);
            expect(createMissionReportSchema.safeParse({ ...payload, selected_ul_id: 'ul-18' }).success).toBe(false);
        }
    });

    it('création : accident absent = Non (anciens clients)', () => {
        const { volunteer_accident: _omit, ...withoutAccident } = base;
        void _omit;
        const parsed = createMissionReportSchema.parse({ ...withoutAccident, selected_ul_id: 'ul-18' });
        expect(parsed.volunteer_accident).toBe(false);
    });

    it('modification : corps complet accepté ; toute clé omise est refusée (pas d\'effacement silencieux)', () => {
        expect(updateMissionReportSchema.safeParse(base).success).toBe(true);
        for (const key of ['volunteer_accident', 'free_comment', 'vehicle_id', 'intervention_types', 'supplies']) {
            const partial: Record<string, unknown> = { ...base };
            delete partial[key];
            expect(updateMissionReportSchema.safeParse(partial).success, key).toBe(false);
        }
    });

    it('description vidée si Non, conservée (rognée) si Oui', () => {
        expect(accidentDetailsToStore({ volunteer_accident: false, volunteer_accident_details: 'texte' })).toBeNull();
        expect(accidentDetailsToStore({ volunteer_accident: true, volunteer_accident_details: '  Entorse  ' })).toBe('Entorse');
    });

    it('la modification ignore le rattachement envoyé', () => {
        const parsed = updateMissionReportSchema.parse({ ...base, selected_ul_id: 'ul-4', selected_dt_code: 'DT 75' });
        expect(parsed).not.toHaveProperty('selected_ul_id');
        expect(parsed).not.toHaveProperty('selected_dt_code');
    });
});

describe('reportToWizardState', () => {
    it('cumule les lignes en double d\'un même article', () => {
        const { supplies } = reportToWizardState({
            mission_type: 'DPS', mission_name: 'M', mission_date: '2026-03-15', location: 'L',
            volunteers: '', pegass_ok: true, vehicle_id: null, driver_id: null, victim_count: 0,
            presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
            free_comment: null, mission_comment: null, had_acr: false, had_hemorrhage: false,
            had_complex_care: false, needs_followup: false,
            supplies: { SAC_PRIMAIRE: [{ item_name: 'Compresses', quantity_used: 2 }, { item_name: 'Compresses', quantity_used: 3 }] },
        });
        expect(supplies).toEqual({ SAC_PRIMAIRE__Compresses: 5 });
    });

    it('aplatit les consommables et reprend accident et répartition', () => {
        const { formData, supplies } = reportToWizardState({
            mission_type: 'DPS', mission_name: 'M', mission_date: '2026-03-15', location: 'L',
            volunteers: null, pegass_ok: true, vehicle_id: 'v1', driver_id: null, victim_count: 1,
            presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
            free_comment: null, mission_comment: null, had_acr: false, had_hemorrhage: false,
            had_complex_care: false, needs_followup: false,
            volunteer_accident: true, volunteer_accident_details: 'Chute',
            supplies: { SAC_PRIMAIRE: [{ item_name: 'Compresses', quantity_used: 3 }] },
            interventions: { mode: { SOINS: 1 }, nature: { MALAISE: 1 } },
        });
        expect(supplies).toEqual({ SAC_PRIMAIRE__Compresses: 3 });
        expect(formData).toMatchObject({
            volunteers: '',
            vehicle_id: 'v1',
            volunteer_accident: true,
            volunteer_accident_details: 'Chute',
            intervention_types: { SOINS: 1 },
            intervention_natures: { MALAISE: 1 },
        });
    });
});
