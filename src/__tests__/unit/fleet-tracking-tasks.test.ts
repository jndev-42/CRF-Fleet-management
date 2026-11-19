/**
 * Tests unitaires — règles pures des tâches et pièces jointes du suivi technique :
 * src/lib/fleetTracking/tasks.ts, src/lib/fleetTracking/attachments.ts, et le calcul
 * pur des rôles (`computeSessionRoles`) qui décide qui est assignable.
 */
import { describe, it, expect } from 'vitest';
import {
    compareTasks,
    createTaskSchema,
    dedupeLinks,
    dueTone,
    formatDueDate,
    formatFrDate,
    groupTasksByStatus,
    initialsOf,
    isValidIsoDate,
    searchParamsToObject,
    taskDeepLink,
    taskFiltersSchema,
    todayIso,
    updateTaskSchema,
    type FleetTask,
} from '@/lib/fleetTracking/tasks';
import {
    attachmentContentDisposition,
    buildTaskAttachmentKey,
    detectAttachmentKind,
    formatAttachmentSize,
    MAX_ATTACHMENT_SIZE,
    sanitizeAttachmentFileName,
    validateAttachmentFile,
} from '@/lib/fleetTracking/attachments';
import { computeSessionRoles } from '@/lib/session-roles';
import { FLEET_TRACKING_INDEX_NAMES, FLEET_TRACKING_TABLES } from '@/lib/fleetTracking/schema';

const task = (patch: Partial<FleetTask>): FleetTask => ({
    id: 'x', title: 'X', description: null, status: 'TODO', priority: 'NORMAL', dueDate: null, pinned: false,
    dossierId: null, completedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: 't', assignees: [], links: [],
    attachmentCount: 0, ...patch,
});

describe('tasks.ts — validation', () => {
    it('création : valeurs par défaut, champs vides normalisés, champ inconnu refusé', () => {
        const parsed = createTaskSchema.parse({ title: '  Devis ', description: '', dueDate: '' });
        expect(parsed).toEqual({ title: 'Devis', description: null, dueDate: null, status: 'TODO', priority: 'NORMAL', pinned: false, assigneeIds: [], links: [] });
        expect(createTaskSchema.safeParse({ title: 'X', ulId: 'ul' }).success).toBe(false);
        expect(createTaskSchema.safeParse({ title: 'X', links: [{ type: 'DOSSIER', id: 'd' }] }).success).toBe(false);
    });

    it('modification : partielle, absente reste absente, vide refusée', () => {
        expect(updateTaskSchema.parse({ status: 'DONE' })).toEqual({ status: 'DONE' });
        expect(updateTaskSchema.parse({ dueDate: null })).toEqual({ dueDate: null });
        expect(updateTaskSchema.safeParse({}).success).toBe(false);
    });

    it('dates calendaires réelles uniquement', () => {
        expect(isValidIsoDate('2026-02-28')).toBe(true);
        expect(isValidIsoDate('2026-02-30')).toBe(false);
        expect(isValidIsoDate('28/02/2026')).toBe(false);
    });

    it('filtres : états connus seulement, chaînes vides ignorées', () => {
        expect(taskFiltersSchema.safeParse({ status: 'TODO,DONE' }).success).toBe(true);
        expect(taskFiltersSchema.safeParse({ status: 'TODO,ARCHIVED' }).success).toBe(false);
        expect(searchParamsToObject(new URLSearchParams('q=&vehicle=v1'))).toEqual({ vehicle: 'v1' });
    });

    it('rattachements dédoublonnés', () => {
        expect(dedupeLinks([{ type: 'VEHICLE', id: 'a' }, { type: 'VEHICLE', id: 'a' }, { type: 'CONTACT', id: 'a' }]))
            .toEqual([{ type: 'VEHICLE', id: 'a' }, { type: 'CONTACT', id: 'a' }]);
    });
});

describe('tasks.ts — affichage', () => {
    it('échéance : « Date à fixer », JJ/MM, et urgence', () => {
        expect(formatDueDate(null)).toBe('Date à fixer');
        expect(formatDueDate('2026-11-20')).toBe('20/11');
        expect(formatFrDate('2026-11-14T10:00')).toBe('14/11/2026');
        expect(dueTone(null, '2026-11-18')).toBeNull();
        expect(dueTone('2026-11-10', '2026-11-18')).toBe('overdue');
        expect(dueTone('2026-11-25', '2026-11-18')).toBe('overdue');
        expect(dueTone('2026-12-10', '2026-11-18')).toBe('soon');
        expect(dueTone('2027-01-30', '2026-11-18')).toBe('later');
        expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('initiales et lien profond', () => {
        expect(initialsOf('Camille Roux')).toBe('CR');
        expect(initialsOf('thomas')).toBe('T');
        expect(taskDeepLink('a b')).toBe('/vehicles?vue=suivi&onglet=taches&tache=a%20b');
    });

    it('ordre d\'une colonne : épinglées, prioritaires, échéance proche, puis récentes ; Terminé par date de fin', () => {
        const list = [
            task({ id: 'plain-old', createdAt: '2026-11-01' }),
            task({ id: 'due-late', dueDate: '2026-12-30' }),
            task({ id: 'due-soon', dueDate: '2026-11-20' }),
            task({ id: 'high', priority: 'HIGH' }),
            task({ id: 'pinned', pinned: true }),
            task({ id: 'plain-new', createdAt: '2026-11-05' }),
            task({ id: 'done-1', status: 'DONE', completedAt: '2026-11-02' }),
            task({ id: 'done-2', status: 'DONE', completedAt: '2026-11-09' }),
        ];
        const groups = groupTasksByStatus(list);
        expect(groups.TODO.map(t => t.id)).toEqual(['pinned', 'high', 'due-soon', 'due-late', 'plain-new', 'plain-old']);
        expect(groups.DONE.map(t => t.id)).toEqual(['done-2', 'done-1']);
        expect(compareTasks(list[0], list[0])).toBe(0);
    });
});

describe('attachments.ts', () => {
    it('reconnaît PDF, JPEG, PNG, WebP par leurs octets ; refuse le reste', () => {
        expect(detectAttachmentKind(Buffer.from('%PDF-1.7'))?.contentType).toBe('application/pdf');
        expect(detectAttachmentKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
        expect(detectAttachmentKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png');
        expect(detectAttachmentKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))?.ext).toBe('webp');
        expect(detectAttachmentKind(Buffer.from('MZ\x90\0'))).toBeNull();
        expect(detectAttachmentKind(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
    });

    it('validation navigateur : type, taille nulle, 4 Mo', () => {
        expect(validateAttachmentFile({ name: 'a.pdf', type: '', size: 10 })).toBeNull();
        expect(validateAttachmentFile({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/PDF ou une image/);
        expect(validateAttachmentFile({ name: 'a.png', type: 'image/png', size: 0 })).toMatch(/PDF ou une image/);
        expect(validateAttachmentFile({ name: 'a.png', type: 'image/png', size: MAX_ATTACHMENT_SIZE + 1 })).toMatch(/4 Mo/);
    });

    it('nom de fichier : sans chemin ni contrôle, extension du type réel', () => {
        expect(sanitizeAttachmentFileName('C:\\temp\\devis "final".pdf', 'pdf')).toBe('devis final.pdf');
        expect(sanitizeAttachmentFileName('virus.exe', 'pdf')).toBe('virus.exe.pdf');
        expect(sanitizeAttachmentFileName('Devis v2.1', 'pdf')).toBe('Devis v2.1.pdf');
        expect(sanitizeAttachmentFileName('photo.JPEG', 'png')).toBe('photo.png');
        expect(sanitizeAttachmentFileName('', 'png')).toBe('piece-jointe.png');
        expect(sanitizeAttachmentFileName(`${'a'.repeat(300)}.jpg`, 'jpg')).toHaveLength(150);
    });

    it('Content-Disposition inline/attachment avec nom UTF-8', () => {
        expect(attachmentContentDisposition('été.pdf', false)).toBe(`inline; filename="ete.pdf"; filename*=UTF-8''%C3%A9t%C3%A9.pdf`);
        expect(attachmentContentDisposition('a.pdf', true)).toMatch(/^attachment;/);
    });

    it('clé R2 rangée par UL et par tâche, segments contrôlés', () => {
        expect(buildTaskAttachmentKey('paris-18', 't1', 'a1', 'pdf')).toBe('fleet-tracking/paris-18/tasks/t1/a1.pdf');
        expect(() => buildTaskAttachmentKey('../x', 't1', 'a1', 'pdf')).toThrow();
        expect(() => buildTaskAttachmentKey('paris', 't/1', 'a1', 'pdf')).toThrow();
    });

    it('taille lisible', () => {
        expect(formatAttachmentSize(2_200_000)).toBe('2,1 Mo');
        expect(formatAttachmentSize(800)).toBe('1 Ko');
    });
});

describe('computeSessionRoles — rôles d\'un compte dans une UL', () => {
    it('rôles d\'UL prioritaires, repli global, SUPER_ADMIN remonté, INACTIF de la home ajouté', () => {
        expect(computeSessionRoles(['ADMIN'], [{ ulId: 'a', is_home: 1, roles: 'RESP_VEHICULE' }], 'a')).toEqual(['RESP_VEHICULE']);
        expect(computeSessionRoles(['ADMIN'], [{ ulId: 'a', is_home: 1, roles: null }], 'a')).toEqual(['ADMIN']);
        expect(computeSessionRoles(['SUPER_ADMIN'], [{ ulId: 'a', is_home: 1, roles: 'CHVL' }], 'a')).toEqual(['SUPER_ADMIN', 'CHVL']);
        expect(computeSessionRoles([], [
            { ulId: 'home', is_home: 1, roles: 'INACTIF' },
            { ulId: 'b', is_home: 0, roles: 'ADMIN' },
        ], 'b')).toEqual(['ADMIN', 'INACTIF']);
    });
});

describe('schema.ts', () => {
    it('déclare les tables et index des tâches', () => {
        expect(FLEET_TRACKING_TABLES).toEqual(['FleetContact', 'FleetTask', 'FleetTaskAssignee', 'FleetTaskLink', 'FleetAttachment', 'FleetDossier', 'FleetDossierItem', 'FleetControlAppointment', 'FleetDossierVehicle']);
        expect(FLEET_TRACKING_INDEX_NAMES).toContain('idx_FleetContact_ulId');
        expect(FLEET_TRACKING_INDEX_NAMES).toContain('idx_FleetAttachment_owner');
        expect(FLEET_TRACKING_INDEX_NAMES).toContain('idx_FleetControlAppointment_ulId');
        expect(FLEET_TRACKING_INDEX_NAMES).toContain('idx_FleetDossierVehicle_vehicleId');
        expect(FLEET_TRACKING_INDEX_NAMES).toHaveLength(12);
    });
});
