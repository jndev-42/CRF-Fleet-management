'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export interface ModuleSetting {
    module_key: string;
    allowed_roles: string[];
}

interface ModuleSettingsContextValue {
    settings: ModuleSetting[];
    loading: boolean;
    canAccess: (key: string, userRoles: string[]) => boolean;
    refresh: () => void;
}

const ModuleSettingsContext = createContext<ModuleSettingsContextValue>({
    settings: [],
    loading: true,
    canAccess: () => true,
    refresh: () => undefined,
});

export function ModuleSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<ModuleSetting[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/modules');
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings ?? []);
            }
        } catch {
            // Non-fatal
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const canAccess = useCallback((key: string, userRoles: string[]): boolean => {
        if (loading) return true;
        const found = settings.find(s => s.module_key === key);
        if (!found) return true;
        if (found.allowed_roles.length === 0) return false;
        return userRoles.some(role => found.allowed_roles.includes(role));
    }, [settings, loading]);

    return (
        <ModuleSettingsContext.Provider value={{ settings, loading, canAccess, refresh: fetchSettings }}>
            {children}
        </ModuleSettingsContext.Provider>
    );
}

export function useModuleSettings(): ModuleSettingsContextValue {
    return useContext(ModuleSettingsContext);
}
