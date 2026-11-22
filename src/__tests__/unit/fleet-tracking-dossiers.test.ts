/**
 * Tests unitaires — dossiers du suivi technique (module pur) : schémas, récapitulatifs
 * d'affichage, tri, liens profonds, clé R2 des pièces jointes de dossier.
 */
import { describe, it, expect } from 'vitest';
import {
    compareDossiers,
    createDossierSchema,
    createItemSchema,
    dossierDeepLink,
    dossierFiltersSchema,
    dossierSummary,
    dossierVehicleNames,
    isHistoryEntryActive,
    missingItemsLabel,
    updateDossierSchema,
    updateItemSchema,
    visibleVehicles,
    type FleetDossier,
} from '@/lib/fleetTracking/dossiers';
import { buildAttachmentKey } from '@/lib/fleetTracking/attachments';
import { createTaskSchema, taskFiltersSchema, updateTaskSchema, vehicleTaskLink } from '@/lib/fleetTracking/tasks';

const dossier = (patch: Partial<FleetDossier>): FleetDossier => ({
    id: 'd', title: 'X', description: null, status: 'OPEN', pinned: false,
    vehicles: [{ id: 'v', name: '75-188', plate: null, missing: false }], createdByName: null,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: 't', closedAt: null, closeReason: null, sourceType: null, sourceId: null,
    taskCount: 0, openTaskCount: 0, itemCount: 0, missingItemCount: 0, attachmentCount: 0, ...patch,
});

describe('dossiers.ts — validation', () => {
    it('création : défauts OPEN / non épinglé, description vide → null, strict', () => {
        expect(createDossierSchema.parse({ vehicleId: 'v', title: ' T ', description: '' }))
            .toEqual({ vehicleIds: ['v'], title: 'T', description: null, status: 'OPEN', pinned: false });
        expect(createDossierSchema.parse({ vehicleIds: ['a', 'b', 'a'], title: 'T' }).vehicleIds).toEqual(['a', 'b']);
        expect(createDossierSchema.safeParse({ vehicleIds: [], title: 'T' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ vehicleIds: Array.from({ length: 51 }, (_, i) => `v${i}`), title: 'T' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ vehicleId: 'v', title: 'T', ulId: 'x' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ title: 'T' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ vehicleId: 'v', title: 'x'.repeat(201) }).success).toBe(false);
    });

    it('modification : partielle, au moins un champ, description absente reste absente', () => {
        expect(updateDossierSchema.parse({ status: 'CLOSED', closeReason: 'REPAIRED' })).toEqual({ status: 'CLOSED', closeReason: 'REPAIRED' });
        expect(updateDossierSchema.safeParse({}).success).toBe(false);
        expect(updateDossierSchema.safeParse({ status: 'DONE' }).success).toBe(false);
        // La liste des véhicules passe par vehicleIds (au moins un).
        expect(updateDossierSchema.safeParse({ vehicleId: 'v2' }).success).toBe(false);
        expect(updateDossierSchema.parse({ vehicleIds: ['v2', 'v2'] })).toEqual({ vehicleIds: ['v2'] });
        expect(updateDossierSchema.safeParse({ vehicleIds: [] }).success).toBe(false);
    });

    it('pièces : libellé requis ≤ 200, valeur ≤ 500, attachmentId nullable', () => {
        expect(createItemSchema.safeParse({ label: '' }).success).toBe(false);
        expect(updateItemSchema.parse({ received: true, receivedValue: '', attachmentId: null }))
            .toEqual({ received: true, receivedValue: null, attachmentId: null });
        expect(updateItemSchema.safeParse({ receivedValue: 'x'.repeat(501) }).success).toBe(false);
        expect(updateItemSchema.safeParse({}).success).toBe(false);
    });

    it('filtres de liste et tâches : status connu, dossier=<id>|none', () => {
        expect(dossierFiltersSchema.safeParse({ status: 'FOO' }).success).toBe(false);
        expect(taskFiltersSchema.parse({ dossier: 'none' })).toEqual({ dossier: 'none' });
        expect(createTaskSchema.parse({ title: 'T', dossierId: 'd-1' }).dossierId).toBe('d-1');
        expect(updateTaskSchema.parse({ dossierId: null })).toEqual({ dossierId: null });
    });
});

describe('dossiers.ts — affichage', () => {
    it('véhicules : noms joints, véhicules partis écartés de visibleVehicles', () => {
        const d = dossier({ vehicles: [
            { id: 'a', name: '75-188', plate: null, missing: false },
            { id: 'b', name: 'Véhicule indisponible', plate: null, missing: true },
            { id: 'c', name: '75-186', plate: 'AA', missing: false },
        ] });
        expect(dossierVehicleNames(d)).toBe('75-188, Véhicule indisponible, 75-186');
        expect(visibleVehicles(d).map(v => v.id)).toEqual(['a', 'c']);
    });

    it('vehicleTaskLink : rattachement véhicule (libellé = nom, détail = plaque)', () => {
        expect(vehicleTaskLink({ id: 'v', label: '75-188', detail: 'GV-114-QM' })).toEqual({
            type: 'VEHICLE', id: 'v', label: '75-188', detail: 'GV-114-QM', phone: null, vehicleName: '75-188', missing: false,
        });
    });

    it('missingItemsLabel', () => {
        expect(missingItemsLabel([])).toBeNull();
        expect(missingItemsLabel([{ received: true }, { received: false }])).toBe('1 sur 2 manquantes');
        expect(missingItemsLabel([{ received: false }, { received: false }, { received: true }, { received: true }])).toBe('2 sur 4 manquantes');
        expect(missingItemsLabel([{ received: true }])).toBe('Toutes reçues');
    });

    it('dossierSummary : ouvert (en cours, manquantes) ou clos (tâches), pièces jointes', () => {
        expect(dossierSummary(dossier({ openTaskCount: 2, missingItemCount: 1 }))).toBe('2 tâches en cours · 1 pièce manquante');
        expect(dossierSummary(dossier({ status: 'CLOSED', taskCount: 3, attachmentCount: 1 }))).toBe('3 tâches · 1 pièce jointe');
        expect(dossierSummary(dossier({}))).toBe('');
    });

    it('compareDossiers : épinglés, puis ouverts, puis les plus récents', () => {
        const list = [
            dossier({ id: 'old-open', createdAt: '2026-01-01' }),
            dossier({ id: 'closed', status: 'CLOSED', createdAt: '2026-12-01' }),
            dossier({ id: 'new-open', createdAt: '2026-06-01' }),
            dossier({ id: 'pinned-closed', status: 'CLOSED', pinned: true, createdAt: '2025-01-01' }),
        ].sort(compareDossiers);
        expect(list.map(d => d.id)).toEqual(['pinned-closed', 'new-open', 'old-open', 'closed']);
    });

    it('liens et état d\'une entrée d\'historique', () => {
        expect(dossierDeepLink('a b')).toBe('/vehicles?vue=suivi&onglet=dossiers&dossier=a%20b');
        expect(isHistoryEntryActive({ kind: 'DOSSIER', date: 't', dossier: dossier({ status: 'CLOSED' }) })).toBe(false);
        expect(isHistoryEntryActive({ kind: 'DOSSIER', date: 't', dossier: dossier({}) })).toBe(true);
    });

    it('clé R2 d\'une pièce jointe de dossier', () => {
        expect(buildAttachmentKey('DOSSIER', 'paris-18', 'd1', 'a1', 'png')).toBe('fleet-tracking/paris-18/dossiers/d1/a1.png');
        expect(() => buildAttachmentKey('DOSSIER', 'paris-18', '../d', 'a1', 'png')).toThrow();
    });
});

describe('dossiers Nouveau et En attente = ouverts', () => {
    it('dossierSummary détaille tâches en cours et pièces manquantes', () => {
        for (const status of ['NEW', 'WAITING'] as const) {
            expect(dossierSummary(dossier({ status, openTaskCount: 1, missingItemCount: 2 }))).toBe('1 tâche en cours · 2 pièces manquantes');
        }
    });

    it('compareDossiers : Nouveau et En attente passent avant les clos', () => {
        const list = [
            dossier({ id: 'closed', status: 'CLOSED', createdAt: '2026-12-01' }),
            dossier({ id: 'waiting', status: 'WAITING', createdAt: '2026-01-01' }),
            dossier({ id: 'new', status: 'NEW', createdAt: '2026-02-01' }),
        ].sort(compareDossiers);
        expect(list.map(d => d.id)).toEqual(['new', 'waiting', 'closed']);
    });

    it('isHistoryEntryActive : actif pour Nouveau et En attente', () => {
        for (const status of ['NEW', 'WAITING'] as const) {
            expect(isHistoryEntryActive({ kind: 'DOSSIER', date: 't', dossier: dossier({ status }) })).toBe(true);
        }
    });
});
