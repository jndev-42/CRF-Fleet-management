import { useEffect, useState } from 'react';

/**
 * Papiers de conduite du compte connecté (`GET /api/me/license-check`), pour bloquer
 * le bouton d'emprunt du parcours QR. Fail-open à l'affichage : `POST
 * /api/qr/[token]/checkout` rejoue la garde côté serveur et répond 403.
 */
export function useLicenseBlocked(): boolean {
    const [blocked, setBlocked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/me/license-check')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled && data?.blocked) setBlocked(true); })
            .catch(console.error);
        return () => { cancelled = true; };
    }, []);

    return blocked;
}
