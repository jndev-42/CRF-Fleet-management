"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bell } from 'lucide-react';
import { isInactive } from '@/lib/roles';
import {
    hasBrowserSubscription,
    isPushSupported,
    resubscribeSilently,
    subscribeToPush,
    unregisterLegacyWorkers,
    unsubscribeFromPush,
} from '@/lib/push/client';
import styles from './PushProvider.module.css';

/**
 * - `unsupported` : navigateur sans Web Push, ou clés VAPID non configurées
 * - `loading`     : état du navigateur pas encore lu
 * - `denied`      : autorisation refusée dans le navigateur
 * - `disabled`    : pas d'abonnement sur cet appareil
 * - `enabled`     : appareil abonné
 */
export type PushStatus = 'unsupported' | 'loading' | 'denied' | 'disabled' | 'enabled';

export interface PushContextValue {
    status: PushStatus;
    /** À appeler sur un geste utilisateur (demande l'autorisation si besoin). Retourne `true` si abonné. */
    subscribe: () => Promise<boolean>;
    /** Désactivation voulue par l'utilisateur : mémorisée, pas de réabonnement silencieux ensuite. */
    unsubscribe: () => Promise<void>;
    /** Retire l'abonnement de l'appareil sans mémoriser de refus (déconnexion). */
    detachDevice: () => Promise<void>;
}

const noop = async () => {};
const PushContext = createContext<PushContextValue>({
    status: 'unsupported',
    subscribe: async () => false,
    unsubscribe: noop,
    detachDevice: noop,
});

export function usePush(): PushContextValue {
    return useContext(PushContext);
}

// Une clé par utilisateur : le navigateur peut être partagé entre plusieurs comptes.
const optOutKey = (userId: string | undefined) => `martine.push.optOut.${userId ?? ''}`;
const SNOOZE_KEY = 'martine.push.bannerSnoozedUntil';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function readStorage(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null) {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch { /* stockage indisponible (navigation privée) : préférence non mémorisée */ }
}

function isSnoozed(): boolean {
    const until = Number(readStorage(SNOOZE_KEY));
    return Number.isFinite(until) && until > Date.now();
}

export function PushProvider({ vapidPublicKey, children }: { vapidPublicKey: string; children: React.ReactNode }) {
    const { data: session, status: sessionStatus } = useSession();
    const [status, setStatus] = useState<PushStatus>('loading');
    const [bannerDismissed, setBannerDismissed] = useState(false);

    const active = sessionStatus === 'authenticated' && !isInactive((session?.user?.roles || []) as string[]);
    const userId = session?.user?.id;
    // En impersonation, `user.id` est celui du compte imité : l'appareil de l'admin ne doit pas lui être rattaché.
    const impersonating = !!session?.user?.impersonatedEmail;

    useEffect(() => {
        if (!active) return;
        // L'ancien worker du fournisseur précédent est retiré dès que le push est supporté,
        // quel que soit l'état d'autorisation ou d'abonnement.
        const legacyCleanup = isPushSupported() ? unregisterLegacyWorkers() : Promise.resolve();
        if (!vapidPublicKey || !isPushSupported()) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- état dérivé de l'environnement navigateur, lu après hydratation (SSR)
            setStatus('unsupported');
            return;
        }
        let cancelled = false;
        const sync = async () => {
            await legacyCleanup;
            if (Notification.permission === 'denied') {
                if (!cancelled) setStatus('denied');
                return;
            }
            try {
                // Autorisation déjà accordée (utilisateurs existants) : réabonnement silencieux,
                // sauf si l'utilisateur a lui-même désactivé les notifications sur cet appareil.
                if (!impersonating && Notification.permission === 'granted' && readStorage(optOutKey(userId)) !== '1') {
                    const subscribed = await resubscribeSilently(vapidPublicKey);
                    if (!cancelled) setStatus(subscribed ? 'enabled' : 'disabled');
                    return;
                }
                const subscribed = await hasBrowserSubscription();
                if (!cancelled) setStatus(subscribed ? 'enabled' : 'disabled');
            } catch (error) {
                console.error('Push setup error:', error);
                if (!cancelled) setStatus('disabled');
            }
        };
        sync();
        return () => { cancelled = true; };
    }, [active, userId, impersonating, vapidPublicKey]);

    const subscribe = useCallback(async () => {
        try {
            const ok = await subscribeToPush(vapidPublicKey);
            if (ok) writeStorage(optOutKey(userId), null);
            setStatus(ok ? 'enabled' : (Notification.permission === 'denied' ? 'denied' : 'disabled'));
            return ok;
        } catch (error) {
            console.error('Push subscribe error:', error);
            setStatus('disabled');
            return false;
        }
    }, [vapidPublicKey, userId]);

    const unsubscribe = useCallback(async () => {
        writeStorage(optOutKey(userId), '1');
        try { await unsubscribeFromPush(); } catch (error) { console.error('Push unsubscribe error:', error); }
        setStatus('disabled');
    }, [userId]);

    const detachDevice = useCallback(async () => {
        try { await unsubscribeFromPush(); } catch (error) { console.error('Push unsubscribe error:', error); }
    }, []);

    const snooze = useCallback(() => {
        writeStorage(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
        setBannerDismissed(true);
    }, []);

    const value = useMemo<PushContextValue>(
        () => ({ status, subscribe, unsubscribe, detachDevice }),
        [status, subscribe, unsubscribe, detachDevice],
    );

    // Jamais d'invite sans geste : le bandeau n'apparaît que si l'autorisation n'a pas encore été demandée.
    const showBanner = active
        && !impersonating
        && status === 'disabled'
        && !bannerDismissed
        && typeof Notification !== 'undefined'
        && Notification.permission === 'default'
        && !isSnoozed();

    return (
        <PushContext.Provider value={value}>
            {children}
            {showBanner && (
                <div className={styles.banner} role="region" aria-label="Notifications push">
                    <Bell size={20} className={styles.icon} aria-hidden="true" />
                    <span className={styles.text}>Activer les notifications : recevez les alertes importantes sur cet appareil.</span>
                    <div className={styles.actions}>
                        <button type="button" className="btn btn-primary" onClick={() => { void subscribe(); }}>
                            Activer
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={snooze}>
                            Plus tard
                        </button>
                    </div>
                </div>
            )}
        </PushContext.Provider>
    );
}
