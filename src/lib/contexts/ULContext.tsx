'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

export type ULEntry = {
    id: string;
    name: string;
    slug: string;
    isHome: boolean;
    dtCode?: string | null;
};

interface ULContextValue {
    activeUL: ULEntry | null;
    availableULs: ULEntry[];
    switchUL: (ulId: string) => Promise<void>;
    isMultiUL: boolean;
}

const ULContext = createContext<ULContextValue>({
    activeUL: null,
    availableULs: [],
    switchUL: async () => undefined,
    isMultiUL: false,
});

export function ULProvider({ children }: { children: ReactNode }) {
    const { data: session, update } = useSession();

    const availableULs = (session?.user?.availableULs as ULEntry[] | undefined) ?? [];
    const ulId = session?.user?.ulId as string | undefined;
    const activeUL = availableULs.find(ul => ul.id === ulId) ?? availableULs[0] ?? null;

    const switchUL = useCallback(async (newUlId: string) => {
        await update({ ulId: newUlId });
    }, [update]);

    return (
        <ULContext.Provider value={{
            activeUL,
            availableULs,
            switchUL,
            isMultiUL: availableULs.length > 1,
        }}>
            {children}
        </ULContext.Provider>
    );
}

export function useUL(): ULContextValue {
    return useContext(ULContext);
}
