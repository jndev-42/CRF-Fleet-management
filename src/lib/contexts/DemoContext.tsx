'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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
    useEffect(() => {
        let cancelled = false;
        fetch('/api/demo/status')
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { available?: boolean } | null) => {
                if (cancelled || !data) return;
                const available = data.available === true;
                setIsDemoAvailable(available);
                if (!available && localStorage.getItem(IS_DEMO_MODE_KEY) === 'true') {
                    localStorage.setItem(IS_DEMO_MODE_KEY, 'false');
                    setDemoCookie(false);
                    setIsDemoMode(false);
                }
            })
            .catch(() => {
                // Statut indisponible : bouton masqué, démo en cours inchangée.
            });
        return () => {
            cancelled = true;
        };
    }, []);

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
        <DemoContext.Provider value={{ isDemoMode: effectiveDemo, isDemoAvailable, toggleDemoMode }}>
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
