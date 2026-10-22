/**
 * Web Push côté navigateur (Push API + Notifications API) — aucun SDK tiers.
 *
 * Fonctions sans état React, utilisées par `PushProvider`. À n'appeler que dans le
 * navigateur. `requestPermission()` n'est invoqué que depuis `subscribeToPush`, que
 * l'appelant ne doit déclencher que sur un geste utilisateur.
 */

const SERVICE_WORKER_URL = '/sw.js';
const SUBSCRIPTIONS_API = '/api/push/subscriptions';

export function isPushSupported(): boolean {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
}

/** Clé publique VAPID (base64url) → octets attendus par `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
    if (!a) return false;
    const view = new Uint8Array(a);
    return view.length === b.length && view.every((v, i) => v === b[i]);
}

/**
 * Désenregistre tout service worker autre que `/sw.js` (ancien worker du fournisseur
 * précédent) : son abonnement n'est plus utilisable et il entrerait en conflit sur le scope.
 */
export async function unregisterLegacyWorkers(): Promise<void> {
    if (!isPushSupported()) return;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async registration => {
            const worker = registration.active || registration.waiting || registration.installing;
            if (!worker) return;
            if (new URL(worker.scriptURL).pathname !== SERVICE_WORKER_URL) {
                await registration.unregister();
            }
        }));
    } catch (error) {
        console.error('Failed to unregister legacy service workers:', error);
    }
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const res = await fetch(SUBSCRIPTIONS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) throw new Error(`Enregistrement de l'abonnement impossible (${res.status})`);
}

/** Abonnement du navigateur à la clé VAPID courante (recrée l'abonnement si la clé a changé). */
async function ensureBrowserSubscription(registration: ServiceWorkerRegistration, vapidPublicKey: string): Promise<PushSubscription> {
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
        if (sameKey(existing.options?.applicationServerKey, applicationServerKey)) return existing;
        await existing.unsubscribe();
    }
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}

/**
 * Abonne l'appareil : (au besoin) demande l'autorisation, abonne le navigateur puis
 * enregistre l'abonnement côté serveur. Retourne `false` si l'autorisation n'est pas accordée.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
    if (!isPushSupported()) return false;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    await unregisterLegacyWorkers();
    const registration = await getRegistration();
    const subscription = await ensureBrowserSubscription(registration, vapidPublicKey);
    await saveSubscription(subscription);
    return true;
}

/**
 * Réabonnement silencieux : seulement si l'autorisation est DÉJÀ accordée (jamais d'invite).
 * Retourne `true` si l'appareil est abonné à l'issue de l'appel.
 */
export async function resubscribeSilently(vapidPublicKey: string): Promise<boolean> {
    if (!isPushSupported() || Notification.permission !== 'granted') return false;
    await unregisterLegacyWorkers();
    const registration = await getRegistration();
    const subscription = await ensureBrowserSubscription(registration, vapidPublicKey);
    await saveSubscription(subscription);
    return true;
}

/** `true` si ce navigateur a un abonnement push actif (sans rien enregistrer ni demander). */
export async function hasBrowserSubscription(): Promise<boolean> {
    if (!isPushSupported()) return false;
    try {
        const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
        if (!registration) return false;
        return !!(await registration.pushManager.getSubscription());
    } catch {
        return false;
    }
}

/** Supprime l'abonnement de l'appareil côté serveur puis côté navigateur. */
export async function unsubscribeFromPush(): Promise<void> {
    if (!isPushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    try {
        await fetch(SUBSCRIPTIONS_API, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
    } catch (error) {
        console.error('Failed to delete push subscription on server:', error);
    }
    await subscription.unsubscribe();
}
