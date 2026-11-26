import { useCallback, useEffect, useRef, useState } from 'react';

export type AppNotification = {
    id: string;
    title: string;
    message: string;
    url?: string;
    isRead: boolean;
    createdAt: string;
};

/** Chaque appel réveille une fonction serveur : l'intervalle pèse directement sur le CPU facturé. */
const POLL_INTERVAL_MS = 5 * 60_000;
/** Au retour sur l'onglet, pas de rechargement si le serveur a répondu depuis moins longtemps. */
const MIN_REFRESH_GAP_MS = 60_000;
/** Une requête sans réponse ne doit pas bloquer la boucle (réseau figé après une mise en veille). */
const REQUEST_TIMEOUT_MS = 30_000;

type Loaded = { scope: string; items: AppNotification[] };

/**
 * Notifications de la cloche : chargées au montage et à chaque changement de `scope`, puis toutes
 * les 5 min, uniquement onglet visible. Une seule requête en vol à la fois.
 *
 * Seul `visibilitychange` est écouté au retour sur l'onglet : `focus` se déclenche en même temps
 * et ferait un appel en double.
 *
 * @param scope personne et UL affichées. Une liste n'est jamais montrée sous un autre `scope` que le sien.
 */
export function useNotifications(scope: string) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    /** Compte les suppressions : une réponse demandée avant l'une d'elles est périmée. */
    const removalsRef = useRef(0);
    const loadRef = useRef<() => Promise<AppNotification[] | null>>(async () => null);

    useEffect(() => {
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let inFlight: { controller: AbortController; promise: Promise<AppNotification[] | null> } | null = null;
        let lastAnswerAt: number | null = null;

        const isVisible = () => document.visibilityState === 'visible';

        const schedule = (delay: number) => {
            clearTimeout(timer);
            if (!disposed && isVisible()) timer = setTimeout(load, delay);
        };

        const request = async (controller: AbortController): Promise<AppNotification[] | null> => {
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const removals = removalsRef.current;
            let items: AppNotification[] | null = null;
            try {
                const res = await fetch('/api/notifications', { signal: controller.signal });
                lastAnswerAt = Date.now();
                if (res.ok) items = (await res.json()).notifications || [];
            } catch (error) {
                if (!disposed) console.error('Failed to fetch notifications:', error);
            } finally {
                clearTimeout(timeout);
            }
            if (disposed) return null;
            inFlight = null;
            // Suppression pendant la requête : sa réponse ferait réapparaître l'élément jusqu'à 5 min.
            if (items && removals !== removalsRef.current) return load();
            // En échec, la liste déjà affichée pour ce `scope` est conservée.
            setLoaded(prev => ({ scope, items: items ?? (prev?.scope === scope ? prev.items : []) }));
            schedule(POLL_INTERVAL_MS);
            return items;
        };

        function load(): Promise<AppNotification[] | null> {
            if (disposed) return Promise.resolve(null);
            clearTimeout(timer);
            if (!inFlight) {
                const controller = new AbortController();
                inFlight = { controller, promise: request(controller) };
            }
            return inFlight.promise;
        }

        const onVisibilityChange = () => {
            if (!isVisible()) {
                clearTimeout(timer);
                return;
            }
            const age = lastAnswerAt === null ? Infinity : Math.abs(Date.now() - lastAnswerAt);
            if (age >= MIN_REFRESH_GAP_MS) void load();
            else schedule(POLL_INTERVAL_MS - age);
        };

        loadRef.current = load;
        if (isVisible()) void load();
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            disposed = true;
            clearTimeout(timer);
            inFlight?.controller.abort();
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [scope]);

    /** Charge tout de suite (ou attend la requête déjà en vol) ; `null` en cas d'échec. À appeler depuis un effet déclaré après ce hook. */
    const reload = useCallback(() => loadRef.current(), []);

    const removeLocally = useCallback((ids: ReadonlySet<string> | 'all') => {
        removalsRef.current++;
        // Suppression demandée sous un autre `scope` : la liste affichée n'est pas concernée.
        setLoaded(prev => prev?.scope !== scope ? prev : {
            scope,
            items: ids === 'all' ? [] : prev.items.filter(n => !ids.has(n.id)),
        });
    }, [scope]);

    const isCurrent = loaded?.scope === scope;
    return {
        notifications: isCurrent ? loaded.items : [],
        isLoading: !isCurrent,
        reload,
        removeLocally,
    };
}
