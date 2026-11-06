/**
 * Mode démo côté serveur : détection d'une requête démo et client de la base démo.
 *
 * Une requête est « démo » si `src/proxy.ts` y a posé l'en-tête `x-crf-demo: 1`
 * (cookie `crf_demo_mode=1` sur une API hors QR/auth ; toute valeur venue du client
 * est retirée) ET que la base démo est configurée (`TURSO_DEMO_DATABASE_URL`,
 * différente de la prod). Hors contexte de requête (cron, scripts, tests),
 * `headers()` lève : ce n'est jamais la démo.
 *
 * Aucun effet au chargement du module : le client démo est créé à la demande
 * (`next build` importe les modules sans les secrets d'exécution).
 */
import { createClient, type Client } from '@libsql/client';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { DEMO_REQUEST_HEADER, isDemoDbConfigured, isDemoDbSameAsProd, normalizeDbUrl } from './readOnly';

export { normalizeDbUrl };

let demoClient: Client | null | undefined;

/** Client de la base démo, ou `null` si elle n'est pas configurée (ou pointe sur la prod). */
export function getDemoClient(): Client | null {
    if (demoClient !== undefined) return demoClient;
    if (isDemoDbSameAsProd()) {
        console.error('[demo] TURSO_DEMO_DATABASE_URL désigne la base de production : mode démo désactivé');
        demoClient = null;
        return demoClient;
    }
    if (!isDemoDbConfigured()) return null;
    try {
        demoClient = createClient({
            url: normalizeDbUrl(process.env.TURSO_DEMO_DATABASE_URL as string),
            authToken: (process.env.TURSO_DEMO_AUTH_TOKEN || '').trim(),
        });
    } catch (e: unknown) {
        console.error('[demo] client démo impossible à créer :', e instanceof Error ? e.message : String(e));
        demoClient = null;
    }
    return demoClient;
}

/** Réinitialise le client démo mémorisé (tests uniquement). */
export function resetDemoClientForTests(): void {
    demoClient = undefined;
}

/** Le proxy a-t-il marqué la requête courante comme démo ? Faux hors requête. */
export async function hasDemoHeader(): Promise<boolean> {
    try {
        const store = await headers();
        return store.get(DEMO_REQUEST_HEADER) === '1';
    } catch (e: unknown) {
        // Erreurs internes de Next (rendu dynamique, prérendu) : à propager telles quelles.
        unstable_rethrow(e);
        return false;
    }
}

/**
 * Vrai pour une requête démo servie par la base démo : en-tête du proxy et base configurée.
 * Sans base démo, on ne lit même pas les en-têtes (comportement inchangé hors démo).
 */
export async function isDemoRequest(): Promise<boolean> {
    if (!isDemoDbConfigured()) return false;
    return hasDemoHeader();
}
