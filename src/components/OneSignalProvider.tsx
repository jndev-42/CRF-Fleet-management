"use client";

import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';

export function OneSignalProvider({ appId, roles }: { appId: string, roles: string[] }) {
    const initialized = useRef(false);

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
                    // Specify the worker path explicitly to ensure SDK finds it correctly
                    path: "/"
                } as any);

                // Show the prompt push right away
                try {
                    await OneSignal.Slidedown.promptPush();
                } catch (e) { /* ignore */ }

                // Set tags so we can target users by roles
                if (roles.length > 0) {
                    const roleTags: Record<string, string> = {};
                    roles.forEach(r => {
                        roleTags[`role_${r}`] = 'true';
                    });

                    // v16 API format
                    if (OneSignal.User && OneSignal.User.addTags) {
                        OneSignal.User.addTags(roleTags);
                    } else if ((OneSignal as any).sendTags) {
                        // older API format fallback
                        (OneSignal as any).sendTags(roleTags);
                    }
                }
            } catch (error) {
                console.error("OneSignal setup error:", error);
            }
        };

        // Only run on client
        if (typeof window !== 'undefined') {
            initializeOneSignal();
        }
    }, [appId, roles]);

    return null;
}
