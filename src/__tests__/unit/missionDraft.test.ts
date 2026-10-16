import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    DRAFT_TTL_MS,
    clearDraft,
    clearDraftFiles,
    loadDraft,
    loadDraftFiles,
    missionDraftKey,
    saveDraft,
    saveDraftFiles,
} from '@/lib/missionDraft';

const KEY = missionDraftKey('/api/missions', 'user-1');

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('missionDraftKey', () => {
    it('distingue le parcours et l\'utilisateur', () => {
        expect(missionDraftKey('/api/missions', 'a')).not.toBe(missionDraftKey('/api/missions', 'b'));
        expect(missionDraftKey('/api/missions', 'a')).not.toBe(missionDraftKey('/api/qr-ul/t/mission-report', 'a'));
        expect(missionDraftKey('/api/qr-ul/t/mission-report')).toContain('anonymous');
    });
});

describe('saveDraft / loadDraft', () => {
    it('relit le brouillon sauvegardé', () => {
        saveDraft(KEY, { step: 3, name: 'Poste' });
        expect(loadDraft(KEY)).toEqual({ step: 3, name: 'Poste' });
    });

    it('renvoie null sans brouillon', () => {
        expect(loadDraft(KEY)).toBeNull();
    });

    it('écarte et supprime un brouillon expiré', () => {
        const now = 1_000_000_000;
        saveDraft(KEY, { step: 2 }, now);
        expect(loadDraft(KEY, now + DRAFT_TTL_MS + 1)).toBeNull();
        expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('ignore un contenu corrompu', () => {
        window.localStorage.setItem(KEY, '{pas du json');
        expect(loadDraft(KEY)).toBeNull();
    });

    it('n\'échoue pas si le stockage refuse l\'écriture', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
        expect(() => saveDraft(KEY, { step: 1 })).not.toThrow();
    });
});

describe('fichiers du brouillon (IndexedDB indisponible)', () => {
    // jsdom n'implémente pas IndexedDB : les fonctions doivent se rabattre sans erreur.
    it('loadDraftFiles renvoie null', async () => {
        await expect(loadDraftFiles(KEY)).resolves.toBeNull();
    });

    it('saveDraftFiles et clearDraftFiles ne lèvent pas', async () => {
        const file = new File(['x'], 'rapport.jpg', { type: 'image/jpeg' });
        await expect(saveDraftFiles(KEY, { signedReport: file, photos: [] })).resolves.toBeUndefined();
        await expect(clearDraftFiles(KEY)).resolves.toBeUndefined();
    });
});

describe('clearDraft', () => {
    it('supprime la partie localStorage du brouillon', async () => {
        saveDraft(KEY, { step: 4 });
        await clearDraft(KEY);
        expect(window.localStorage.getItem(KEY)).toBeNull();
    });
});
