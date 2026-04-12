'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { setupFetchInterceptor } from '../demo/fetchInterceptor';

interface DemoContextType {
    isDemoMode: boolean;
    toggleDemoMode: () => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export const IS_DEMO_MODE_KEY = 'crf_is_demo_mode';

export function DemoProvider({ children }: { children: React.ReactNode }) {
    // Initial state from localStorage to avoid hydration mismatch/cascading renders
    const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(IS_DEMO_MODE_KEY) === 'true';
        }
        return false;
    });

    useEffect(() => {
        // Initialize fetch interceptor as early as possible on client side
        setupFetchInterceptor();
    }, []);

    const toggleDemoMode = () => {
        const newValue = !isDemoMode;
        setIsDemoMode(newValue);
        localStorage.setItem(IS_DEMO_MODE_KEY, String(newValue));
        // Reload to ensure fetch interceptor is properly set up or removed
        window.location.reload();
    };

    return (
        <DemoContext.Provider value={{ isDemoMode, toggleDemoMode }}>
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
