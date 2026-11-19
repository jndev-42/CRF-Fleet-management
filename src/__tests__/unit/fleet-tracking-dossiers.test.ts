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
    isHistoryEntryActive,
    missingItemsLabel,
    updateDossierSchema,
    updateItemSchema,
    type FleetDossier,
} from '@/lib/fleetTracking/dossiers';
import { buildAttachmentKey } from '@/lib/fleetTracking/attachments';
import { createTaskSchema, taskFiltersSchema, updateTaskSchema } from '@/lib/fleetTracking/tasks';

const dossier = (patch: Partial<FleetDossier>): FleetDossier => ({
    id: 'd', title: 'X', description: null, status: 'OPEN', pinned: false,
    vehicle: { id: 'v', name: '75-188', plate: null, missing: false }, createdByName: null,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: 't', closedAt: null,
    taskCount: 0, openTaskCount: 0, itemCount: 0, missingItemCount: 0, attachmentCount: 0, ...patch,
});

describe('dossiers.ts — validation', () => {
    it('création : défauts OPEN / non épinglé, description vide → null, strict', () => {
        expect(createDossierSchema.parse({ vehicleId: 'v', title: ' T ', description: '' }))
            .toEqual({ vehicleId: 'v', title: 'T', description: null, status: 'OPEN', pinned: false });
        expect(createDossierSchema.safeParse({ vehicleId: 'v', title: 'T', ulId: 'x' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ title: 'T' }).success).toBe(false);
        expect(createDossierSchema.safeParse({ vehicleId: 'v', title: 'x'.repeat(201) }).success).toBe(false);
    });

    it('modification : partielle, au moins un champ, description absente reste absente', () => {
        expect(updateDossierSchema.parse({ status: 'CLOSED' })).toEqual({ status: 'CLOSED' });
        expect(updateDossierSchema.safeParse({}).success).toBe(false);
        expect(updateDossierSchema.safeParse({ status: 'DONE' }).success).toBe(false);
        // Véhicule fixé à la création.
        expect(updateDossierSchema.safeParse({ vehicleId: 'v2' }).success).toBe(false);
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
