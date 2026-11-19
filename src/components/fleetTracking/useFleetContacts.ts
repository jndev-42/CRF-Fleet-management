'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetContact } from '@/lib/fleetTracking/contacts';

export const CONTACTS_URL = '/api/fleet-tracking/contacts';

/** Lit le message `{ error }` d'une réponse en échec. */
export async function readError(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json() as { error?: unknown };
        return typeof body.error === 'string' ? body.error : fallback;
    } catch {
        return fallback;
    }
}

/** Contacts de l'UL et prestataires proposés par les autres UL. */
export function useFleetContacts() {
    const [own, setOwn] = useState<FleetContact[]>([]);
    const [shared, setShared] = useState<FleetContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Contacts dont le partage est en cours d'enregistrement : un second clic attend la réponse.
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
    // Miroir synchrone : deux clics dans le même rendu ne lancent pas deux PATCH.
    const pendingRef = useRef(new Set<string>());

    const refetch = useCallback(async () => {
        try {
            const res = await fetch(CONTACTS_URL, { cache: 'no-store' });
            if (!res.ok) {
                setError(await readError(res, 'Chargement des contacts impossible'));
                return;
            }
            const data = await res.json() as { own: FleetContact[]; shared: FleetContact[] };
            setOwn(data.own);
            setShared(data.shared);
            setError(null);
        } catch (e: unknown) {
            console.error('Chargement des contacts :', e);
            setError('Chargement des contacts impossible');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    /**
     * Bascule le partage d'un contact de l'UL ; renvoie le message d'erreur éventuel.
     * L'interrupteur reste désactivé jusqu'à la réponse : pas de PATCH concurrents, et
     * le retour arrière d'un échec ne peut écraser un état plus récent.
     */
    const toggleShared = useCallback(async (contact: FleetContact): Promise<string | null> => {
        if (pendingRef.current.has(contact.id)) return null;
        const next = !contact.shared;
        const setPending = (on: boolean) => {
            if (on) pendingRef.current.add(contact.id); else pendingRef.current.delete(contact.id);
            setPendingIds(prev => {
                const copy = new Set(prev);
                if (on) copy.add(contact.id); else copy.delete(contact.id);
                return copy;
            });
        };
        setPending(true);
        setOwn(list => list.map(c => (c.id === contact.id ? { ...c, shared: next } : c)));
        try {
            const res = await fetch(`${CONTACTS_URL}/${encodeURIComponent(contact.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shared: next }),
            });
            if (res.ok) return null;
            const message = await readError(res, 'Modification du partage impossible');
            setOwn(list => list.map(c => (c.id === contact.id ? { ...c, shared: contact.shared } : c)));
            return message;
        } catch {
            setOwn(list => list.map(c => (c.id === contact.id ? { ...c, shared: contact.shared } : c)));
            return 'Modification du partage impossible';
        } finally {
            setPending(false);
        }
    }, []);

    return { own, shared, loading, error, refetch, toggleShared, pendingIds };
}
