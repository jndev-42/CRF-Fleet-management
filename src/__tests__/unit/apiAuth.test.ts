import { describe, it, expect } from 'vitest';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';

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

describe('isOutsideUl', () => {
    it('autorise une session dont l\'UL correspond à celle de la ressource', () => {
        expect(isOutsideUl(['CHVL'], 'ul-paris', 'ul-paris')).toBe(false);
    });

    it('refuse une session dont l\'UL diffère de celle de la ressource', () => {
        expect(isOutsideUl(['ADMIN'], 'ul-lyon', 'ul-paris')).toBe(true);
    });

    it('exempte SUPER_ADMIN, dont le périmètre est multi-UL', () => {
        expect(isOutsideUl(['SUPER_ADMIN'], 'ul-lyon', 'ul-paris')).toBe(false);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['chaîne vide', ''],
        ['sentinelle "default"', 'default'],
    ])('refuse une session dont l\'ulId vaut %s, même contre la même valeur côté ressource', (_label, ulId) => {
        // Le cœur du durcissement : l'égalité brute aurait rendu `false` ici.
        expect(isOutsideUl(['ADMIN'], ulId, ulId)).toBe(true);
    });

    it('refuse une ressource sans ulId face à une session rattachée', () => {
        expect(isOutsideUl(['ADMIN'], 'ul-paris', null)).toBe(true);
    });

    it('refuse un SUPER_ADMIN qui porte aussi INACTIF (dominance du blocage)', () => {
        // `isSuperAdmin` est enveloppé par `denyWhenInactive` : la dérogation tombe,
        // et la comparaison d'UL reprend la main.
        expect(isOutsideUl(['SUPER_ADMIN', 'INACTIF'], 'ul-lyon', 'ul-paris')).toBe(true);
    });
});
