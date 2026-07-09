"use client";

import { useEffect, useRef, useCallback } from 'react';
import OneSignal from 'react-onesignal';

export function OneSignalProvider({ 
    appId, 
    availableULs,
    globalRoles 
}: { 
    appId: string; 
    availableULs: { id: string; name: string; slug: string; isHome: boolean; roles?: string[] }[];
    globalRoles: string[];
}) {
    const initialized = useRef(false);

    const updateTags = useCallback(() => {
        if (typeof window === 'undefined') return;
        
        try {
            const roleTags: Record<string, string> = {};
            availableULs.forEach(ul => {
                const roles = ul.roles && ul.roles.length > 0 ? ul.roles : globalRoles;
                roles.forEach(r => {
                    roleTags[`role_${ul.id}_${r}`] = 'true';
                    roleTags[`role_${r}`] = 'true'; // compatible fallback
                });
            });

            if (Object.keys(roleTags).length > 0) {
                const legacyOneSignal = OneSignal as unknown as { sendTags?: (tags: Record<string, string>) => void };
                if (OneSignal.User && OneSignal.User.addTags) {
                    OneSignal.User.addTags(roleTags);
                } else if (legacyOneSignal.sendTags) {
                    legacyOneSignal.sendTags(roleTags);
                }
            }
        } catch (e) {
            console.error("Failed to update OneSignal tags:", e);
        }
    }, [availableULs, globalRoles]);

    useEffect(() => {
        if (!appId || initialized.current) return;
        initialized.current = true;

        const initializeOneSignal = async () => {
            // Cleanup redundant custom SW (sw.js) if it exists
            // This is necessary because sw.js conflicts with OneSignal
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    let hasUnregistered = false;
                    for (const registration of registrations) {
                        const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL;
                        if (scriptURL && scriptURL.includes('sw.js') && !scriptURL.includes('OneSignalSDKWorker.js')) {
                            console.log('Unregistering conflicting custom service worker:', scriptURL);
                            await registration.unregister();
                            hasUnregistered = true;
                        }
                    }

                    if (hasUnregistered) {
                        console.log('Conflicting service worker unregistered. Reloading to clear state...');
                        window.location.reload();
                        return; // Stop initialization, rely on the page reload
                    }
                } catch (err) {
                    console.error('Error while checking service workers:', err);
                }
            }

            try {
                await OneSignal.init({
                    appId: appId,
                    allowLocalhostAsSecureOrigin: true,
                    path: "/"
                } as Parameters<typeof OneSignal.init>[0] & { path?: string });

                // Show the prompt push right away
                try {
                    await OneSignal.Slidedown.promptPush();
                } catch { /* ignore prompt push errors — non-blocking */ }

                // Initial tags update
                updateTags();
            } catch (error) {
                console.error("OneSignal setup error:", error);
            }
        };

        // Only run on client
        if (typeof window !== 'undefined') {
            initializeOneSignal();
        }
    }, [appId, updateTags]);

    // React to availableULs changes after initialization
    useEffect(() => {
        if (initialized.current) {
            updateTags();
        }
    }, [availableULs, updateTags]);

    return null;
}
