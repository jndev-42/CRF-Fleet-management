import { describe, it, expect } from 'vitest';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

describe('unauthorizedResponse', () => {
    it('retourne un statut 401 avec le message par défaut', async () => {
        const res = unauthorizedResponse();
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: 'Non authentifié' });
    });

    it('accepte un message personnalisé', async () => {
        const res = unauthorizedResponse('Session expirée');
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ error: 'Session expirée' });
    });
});

describe('forbiddenResponse', () => {
    it('retourne un statut 403 avec le message par défaut', async () => {
        const res = forbiddenResponse();
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).toEqual({ error: 'Interdit' });
    });

    it('accepte un message personnalisé', async () => {
        const res = forbiddenResponse('Seul un responsable peut valider');
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body).toEqual({ error: 'Seul un responsable peut valider' });
    });
});
