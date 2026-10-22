/**
 * Tests unitaires — src/lib/incidentNotifications.ts (DB et push mockés).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn();
vi.mock('@/lib/db', () => ({ db: { execute: (...args: unknown[]) => execute(...args) } }));
const sendPushNotification = vi.fn();
vi.mock('@/lib/push', () => ({ sendPushNotification: (...args: unknown[]) => sendPushNotification(...args) }));

import { notifyIncidentSubmitted } from '@/lib/incidentNotifications';

const vehicleRow = (ulId: string | null) => ({ rows: [{ name: 'VL 186', ulId }] });

beforeEach(() => {
    execute.mockReset();
    sendPushNotification.mockReset();
    sendPushNotification.mockResolvedValue(true);
});

describe('notifyIncidentSubmitted', () => {
    it('notifie les Responsables de l\'UL avec le libellé du type et un lien relatif encodé', async () => {
        execute.mockResolvedValue(vehicleRow('ul-paris-18'));

        await notifyIncidentSubmitted({ vehicleId: 'VL001', type: 'ACCIDENT', authorId: 'u1' });

        expect(sendPushNotification).toHaveBeenCalledWith(expect.objectContaining({
            roles: ['PRESIDENT', 'CADRE'],
            ulId: 'ul-paris-18',
            url: '/vehicles/VL%20186',
            excludeUserId: 'u1',
            contents: expect.objectContaining({ fr: 'Accident déclaré sur VL 186.' }),
        }));
    });

    it('utilise « Amende flash » pour le type FLASH', async () => {
        execute.mockResolvedValue(vehicleRow('ul-paris-18'));

        await notifyIncidentSubmitted({ vehicleId: 'VL001', type: 'FLASH', authorId: 'u1' });

        expect(sendPushNotification.mock.calls[0][0].contents.fr).toBe('Amende flash déclaré sur VL 186.');
    });

    it('retombe sur « Incident » quand le type est null', async () => {
        execute.mockResolvedValue(vehicleRow('ul-paris-18'));

        await notifyIncidentSubmitted({ vehicleId: 'VL001', type: null, authorId: 'u1' });

        expect(sendPushNotification.mock.calls[0][0].headings.fr).toBe('🚨 Incident déclaré');
    });

    it('exclut le déclarant et l\'auteur de l\'action', async () => {
        execute.mockResolvedValue(vehicleRow('ul-paris-18'));

        await notifyIncidentSubmitted({ vehicleId: 'VL001', type: 'FLASH', authorId: 'u1', actorId: 'admin' });

        expect(sendPushNotification.mock.calls[0][0].excludeUserId).toEqual(['u1', 'admin']);
    });

    it('n\'envoie rien si le véhicule est introuvable', async () => {
        execute.mockResolvedValue({ rows: [] });

        await notifyIncidentSubmitted({ vehicleId: 'nope', type: 'FLASH', authorId: 'u1' });

        expect(sendPushNotification).not.toHaveBeenCalled();
    });

    it('n\'envoie rien (et logge) si le véhicule n\'a pas d\'UL', async () => {
        execute.mockResolvedValue(vehicleRow(null));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await notifyIncidentSubmitted({ vehicleId: 'VL001', type: 'FLASH', authorId: 'u1' });

        expect(sendPushNotification).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('ne lève jamais : une erreur est loggée', async () => {
        execute.mockRejectedValue(new Error('boom'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(notifyIncidentSubmitted({ vehicleId: 'VL001', type: 'FLASH', authorId: 'u1' })).resolves.toBeUndefined();

        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
