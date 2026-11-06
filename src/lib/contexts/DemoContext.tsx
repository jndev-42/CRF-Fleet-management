'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { setupFetchInterceptor } from '../demo/fetchInterceptor';
import {
    DEMO_COOKIE_NAME,
    DEMO_COOKIE_VALUE,
    IS_DEMO_MODE_KEY,
    isQrPage,
} from '../demo/readOnly';

interface DemoContextType {
    isDemoMode: boolean;
    /** Base démo configurée côté serveur (`GET /api/demo/status`) : sinon, pas d'activation. */
    isDemoAvailable: boolean;
    /** SUPER_ADMIN avec base démo configurée : peut lancer une recopie (l'interface ne fait que masquer). */
    canRefreshDemo: boolean;
    /** Recopie en cours ou interrompue (`DemoMeta.state = 'refreshing'`), ou lancée depuis cet onglet. */
    isDemoRefreshing: boolean;
    /** Signale une recopie lancée depuis cet onglet ; la relecture du statut remet l'état à jour. */
    markDemoRefreshing: () => void;
    /** Relit `GET /api/demo/status`, par exemple après une recopie. */
    refreshDemoStatus: () => Promise<void>;
    toggleDemoMode: () => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export { IS_DEMO_MODE_KEY };

// Installé dès l'évaluation du module, avant les effets des composants enfants :
// les mutations émises au premier rendu sont déjà interceptées.
if (typeof window !== 'undefined') {
    setupFetchInterceptor();
}

const LEGACY_DEMO_DB_KEY = 'crf_demo_db';

function setDemoCookie(active: boolean) {
    document.cookie = active
        ? `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}; path=/; SameSite=Lax`
        : `${DEMO_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

interface DemoStatus {
    available?: boolean;
    refreshing?: boolean;
    canRefresh?: boolean;
}

/** Statut indisponible (`null`) : bouton masqué, démo en cours inchangée. */
async function readDemoStatus(): Promise<DemoStatus | null> {
    try {
        const res = await fetch('/api/demo/status');
        return res.ok ? ((await res.json()) as DemoStatus) : null;
    } catch {
        return null;
    }
}

function purgeLegacyDemoDb() {
    try {
        localStorage.removeItem(LEGACY_DEMO_DB_KEY);
    } catch {
        // ignoré
    }
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
    // Initial state from localStorage to avoid hydration mismatch/cascading renders
    const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(IS_DEMO_MODE_KEY) === 'true';
        }
        return false;
    });
    const [isDemoAvailable, setIsDemoAvailable] = useState(false);
    const [canRefreshDemo, setCanRefreshDemo] = useState(false);
    const [isDemoRefreshing, setIsDemoRefreshing] = useState(false);
    const pathname = usePathname();

    // La démo est désactivée sur les pages QR publiques.
    const effectiveDemo = isDemoMode && !isQrPage(pathname);

    // Cookie aligné sur la démo choisie (pas sur la page) : il est partagé entre onglets,
    // le retirer sur une page QR ferait écrire en prod un autre onglet resté en démo.
    // Les API QR ne sont jamais servies en démo : le proxy ne les marque pas.
    useEffect(() => {
        const hasCookie = document.cookie
            .split('; ')
            .some((c) => c === `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}`);
        if (isDemoMode && !hasCookie) setDemoCookie(true);
        else if (!isDemoMode && hasCookie) setDemoCookie(false);
    }, [isDemoMode]);

    // Disponibilité de la démo (base démo configurée). Une démo active alors que la base
    // n'est plus configurée est quittée : le serveur refuserait toute écriture.
    const applyDemoStatus = useCallback((data: DemoStatus) => {
        const available = data.available === true;
        setIsDemoAvailable(available);
        setCanRefreshDemo(data.canRefresh === true);
        const refreshing = data.refreshing === true;
        setIsDemoRefreshing(refreshing);
        // Pendant une copie, on reste en démo : pas de bascule silencieuse vers les vraies données.
        if (!available && !refreshing && localStorage.getItem(IS_DEMO_MODE_KEY) === 'true') {
            localStorage.setItem(IS_DEMO_MODE_KEY, 'false');
            setDemoCookie(false);
            setIsDemoMode(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        readDemoStatus().then((data) => {
            if (!cancelled && data) applyDemoStatus(data);
        });
        return () => {
            cancelled = true;
        };
    }, [applyDemoStatus]);

    const markDemoRefreshing = useCallback(() => setIsDemoRefreshing(true), []);

    const refreshDemoStatus = useCallback(async () => {
        const data = await readDemoStatus();
        if (data) applyDemoStatus(data);
    }, [applyDemoStatus]);

    // Ancienne base fictive : purgée une fois au montage.
    useEffect(() => {
        purgeLegacyDemoDb();
    }, []);

    // Autre onglet qui bascule la démo : on recharge pour rester cohérent.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === IS_DEMO_MODE_KEY) window.location.reload();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const toggleDemoMode = () => {
        const newValue = !isDemoMode;
        setIsDemoMode(newValue);
        localStorage.setItem(IS_DEMO_MODE_KEY, String(newValue));
        setDemoCookie(newValue);
        purgeLegacyDemoDb();
        // Reload pour repartir d'un état propre (base réelle / base démo)
        window.location.reload();
    };

    return (
        <DemoContext.Provider value={{ isDemoMode: effectiveDemo, isDemoAvailable, canRefreshDemo, isDemoRefreshing, markDemoRefreshing, refreshDemoStatus, toggleDemoMode }}>
            {children}
        </DemoContext.Provider>
    );
}

export function useDemoMode() {
    const context = useContext(DemoContext);
    if (context === undefined) {
        throw new Error('useDemoMode must be used within a DemoProvider');
    }
    return context;
}
