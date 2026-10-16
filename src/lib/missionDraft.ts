/**
 * Brouillon du compte rendu de mission (issue #134).
 *
 * Sur Android, ouvrir l'appareil photo depuis le navigateur peut pousser le
 * système à tuer l'onglet faute de mémoire : au retour, la page se recharge et
 * tout l'état React du wizard est perdu. On garde donc un brouillon :
 *  - champs, matériel et étape en cours → localStorage (synchrone, lu au montage) ;
 *  - rapport signé et photos → IndexedDB (les `File` y sont clonables, et trop
 *    lourds pour localStorage).
 *
 * Toutes les fonctions échouent silencieusement : navigation privée, stockage
 * plein ou indisponible ne doivent jamais bloquer la saisie.
 */

const KEY_PREFIX = 'crf_mission_draft:';
/** Au-delà, un brouillon est considéré comme abandonné. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const IDB_NAME = 'crf_mission_drafts';
const IDB_STORE = 'files';

export interface DraftFiles {
    signedReport: File | null;
    photos: File[];
}

interface StoredDraft<T> {
    savedAt: number;
    data: T;
}

/** Clé de brouillon propre au parcours (classique / QR d'UL) et à l'utilisateur. */
export function missionDraftKey(endpoint: string, userId?: string | null): string {
    return `${KEY_PREFIX}${endpoint}:${userId ?? 'anonymous'}`;
}

export function loadDraft<T>(key: string, now = Date.now()): T | null {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredDraft<T>;
        if (typeof parsed?.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) {
            window.localStorage.removeItem(key);
            return null;
        }
        return parsed.data ?? null;
    } catch {
        return null;
    }
}

export function saveDraft<T>(key: string, data: T, now = Date.now()): void {
    try {
        const payload: StoredDraft<T> = { savedAt: now, data };
        window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // Stockage indisponible ou plein : le brouillon est un filet, pas un prérequis.
    }
}

function openFilesDb(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined') { resolve(null); return; }
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest | null,
    fallback: T,
): Promise<T> {
    const db = await openFilesDb();
    if (!db) return fallback;
    return new Promise<T>(resolve => {
        try {
            const tx = db.transaction(IDB_STORE, mode);
            const req = run(tx.objectStore(IDB_STORE));
            tx.oncomplete = () => { db.close(); resolve(req ? (req.result as T) ?? fallback : fallback); };
            tx.onerror = () => { db.close(); resolve(fallback); };
            tx.onabort = () => { db.close(); resolve(fallback); };
        } catch {
            db.close();
            resolve(fallback);
        }
    });
}

export async function loadDraftFiles(key: string, now = Date.now()): Promise<DraftFiles | null> {
    const stored = await withStore<StoredDraft<DraftFiles> | null>('readonly', store => store.get(key), null);
    if (!stored || typeof stored.savedAt !== 'number') return null;
    if (now - stored.savedAt > DRAFT_TTL_MS) {
        await clearDraftFiles(key);
        return null;
    }
    return stored.data;
}

export async function saveDraftFiles(key: string, files: DraftFiles, now = Date.now()): Promise<void> {
    if (!files.signedReport && files.photos.length === 0) {
        await clearDraftFiles(key);
        return;
    }
    const payload: StoredDraft<DraftFiles> = { savedAt: now, data: files };
    await withStore('readwrite', store => store.put(payload, key), undefined);
}

export async function clearDraftFiles(key: string): Promise<void> {
    await withStore('readwrite', store => store.delete(key), undefined);
}

/** Supprime le brouillon complet (champs + fichiers). */
export async function clearDraft(key: string): Promise<void> {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignoré
    }
    await clearDraftFiles(key);
}
