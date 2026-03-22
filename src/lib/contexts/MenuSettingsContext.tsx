'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export type MenuVisibility = 'available' | 'admin_only' | 'disabled';

export interface MenuSetting {
    menu_key: string;
    visibility: MenuVisibility;
}

interface MenuSettingsContextValue {
    settings: MenuSetting[];
    loading: boolean;
    getVisibility: (key: string) => MenuVisibility;
    refresh: () => void;
}

const MenuSettingsContext = createContext<MenuSettingsContextValue>({
    settings: [],
    loading: true,
    getVisibility: () => 'available',
    refresh: () => undefined,
});

export function MenuSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<MenuSetting[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/menus');
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings ?? []);
            }
        } catch {
            // Non-fatal: default to 'available' on error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const getVisibility = useCallback((key: string): MenuVisibility => {
        if (loading) return 'available';
        const found = settings.find(s => s.menu_key === key);
        return found?.visibility ?? 'available';
    }, [settings, loading]);

    return (
        <MenuSettingsContext.Provider value={{ settings, loading, getVisibility, refresh: fetchSettings }}>
            {children}
        </MenuSettingsContext.Provider>
    );
}

export function useMenuSettings(): MenuSettingsContextValue {
    return useContext(MenuSettingsContext);
}
