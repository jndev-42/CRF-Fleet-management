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
    const pathname = usePathname();

    // La démo est désactivée sur les pages QR publiques.
    const effectiveDemo = isDemoMode && !isQrPage(pathname);

    // Cookie aligné sur la démo effective : retiré sur les pages QR (vraies écritures),
    // restauré ailleurs ; un localStorage actif sans cookie est resynchronisé au chargement.
    useEffect(() => {
        const hasCookie = document.cookie
            .split('; ')
            .some((c) => c === `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}`);
        if (effectiveDemo && !hasCookie) setDemoCookie(true);
        else if (!effectiveDemo && hasCookie) setDemoCookie(false);
    }, [effectiveDemo]);

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
        // Reload pour repartir d'un état propre (données réelles / mode démo)
        window.location.reload();
    };

    return (
        <DemoContext.Provider value={{ isDemoMode: effectiveDemo, toggleDemoMode }}>
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
