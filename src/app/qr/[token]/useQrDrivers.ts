import { useEffect, useState } from 'react';

export interface QrDriver {
    id: string;
    name: string | null;
    email: string;
}

/** Conducteurs proposables comme 2ème conducteur à l'emprunt par QR code. */
export function useQrDrivers(token: string): QrDriver[] {
    const [drivers, setDrivers] = useState<QrDriver[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/qr/${encodeURIComponent(token)}/drivers`)
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => { if (!cancelled && Array.isArray(data.users)) setDrivers(data.users); })
            .catch(console.error);
        return () => { cancelled = true; };
    }, [token]);

    return drivers;
}
