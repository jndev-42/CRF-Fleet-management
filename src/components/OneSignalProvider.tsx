"use client";

import { useEffect, useRef } from 'react';
import OneSignal from 'react-onesignal';

export function OneSignalProvider({ appId, roles }: { appId: string, roles: string[] }) {
    const initialized = useRef(false);

    useEffect(() => {
        if (!appId || initialized.current) return;
        initialized.current = true;

        const runOneSignal = async () => {
            try {
                await OneSignal.init({
                    appId: appId,
                    allowLocalhostAsSecureOrigin: true,
                });

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
            runOneSignal();
        }
    }, [appId, roles]);

    return null;
}
