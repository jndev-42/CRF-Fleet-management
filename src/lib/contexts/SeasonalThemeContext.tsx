'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface ActiveTheme {
    theme: string;
    startDate: string;
}

interface SeasonalThemeContextValue {
    /** Clé du thème actif aujourd'hui (même masqué), `null` sinon. */
    theme: string | null;
    /** `true` si l'utilisateur a masqué le thème actif. */
    hidden: boolean;
    toggleHidden: () => void;
}

const SeasonalThemeContext = createContext<SeasonalThemeContextValue>({
    theme: null,
    hidden: false,
    toggleHidden: () => undefined,
});

/** Clé de mémorisation : une nouvelle plage (autre `startDate`) réaffiche le thème. */
function storageKey(active: ActiveTheme): string {
    return `seasonal-theme-hidden:${active.theme}:${active.startDate}`;
}

function readHidden(active: ActiveTheme): boolean {
    try {
        return localStorage.getItem(storageKey(active)) === '1';
    } catch {
        return false;
    }
}

function writeHidden(active: ActiveTheme, hidden: boolean): void {
    try {
        if (hidden) localStorage.setItem(storageKey(active), '1');
        else localStorage.removeItem(storageKey(active));
    } catch {
        // Stockage indisponible : le choix vaut pour la session en cours seulement.
    }
}

export function SeasonalThemeProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    // UL active : le thème peut être réservé à certaines UL, on le réévalue à chaque changement.
    const ulId = (session?.user?.ulId as string | undefined) ?? null;
    const [active, setActive] = useState<ActiveTheme | null>(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (status !== 'authenticated') return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/api/themes/active');
                if (!res.ok) {
                    // Ne pas laisser le thème de l'UL précédente après un changement d'UL.
                    if (!cancelled) setActive(null);
                    return;
                }
                const data = await res.json();
                if (cancelled) return;
                if (typeof data.theme !== 'string' || typeof data.startDate !== 'string') {
                    setActive(null);
                    return;
                }
                const next: ActiveTheme = { theme: data.theme, startDate: data.startDate };
                setActive(next);
                setHidden(readHidden(next));
            } catch {
                // Silencieux : pas de déco si le thème est injoignable.
                if (!cancelled) setActive(null);
            }
        };
        // Un onglet resté ouvert à travers minuit (Paris) doit voir le thème expirer ou démarrer.
        const onVisibility = () => {
            if (document.visibilityState === 'visible') load();
        };
        load();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', load);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', load);
        };
    }, [status, ulId]);

    const season = active && !hidden && status === 'authenticated' ? active.theme : null;

    useEffect(() => {
        if (season) document.documentElement.setAttribute('data-season', season);
        else document.documentElement.removeAttribute('data-season');
        return () => document.documentElement.removeAttribute('data-season');
    }, [season]);

    const toggleHidden = useCallback(() => {
        if (!active) return;
        const next = !hidden;
        setHidden(next);
        writeHidden(active, next);
    }, [active, hidden]);

    const value = useMemo<SeasonalThemeContextValue>(
        () => ({ theme: status === 'authenticated' ? active?.theme ?? null : null, hidden, toggleHidden }),
        [status, active, hidden, toggleHidden],
    );

    return <SeasonalThemeContext.Provider value={value}>{children}</SeasonalThemeContext.Provider>;
}

export function useSeasonalTheme(): SeasonalThemeContextValue {
    return useContext(SeasonalThemeContext);
}
