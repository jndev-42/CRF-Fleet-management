import { NextResponse } from 'next/server';
import { forbiddenResponse } from '@/lib/apiAuth';
import { ownsResource, type FleetAccess } from './access';
import { getDossierRow, getUlVehicleIds, type DossierRow } from './dossiersStore';
import { MAX_TASK_LINKS, type TaskLinkInput } from './tasks';

/**
 * Contrôles d'appartenance des dossiers, communs à leurs routes et à celles des
 * tâches — serveur uniquement.
 */

export const DOSSIER_NOT_FOUND = () => NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });

/** Dossier de l'UL de session, ou la réponse 404 / 403 à renvoyer. */
export async function loadOwnedDossier(
    access: Extract<FleetAccess, { ok: true }>,
    id: string,
): Promise<{ ok: true; row: DossierRow } | { ok: false; response: NextResponse }> {
    const row = await getDossierRow(id);
    if (!row) return { ok: false, response: DOSSIER_NOT_FOUND() };
    if (!ownsResource(access, row.ulId)) return { ok: false, response: forbiddenResponse('Ce dossier appartient à une autre unité locale') };
    return { ok: true, row };
}

/**
 * NOUVEAU dossier choisi pour une tâche (création, ou dossier différent de l'actuel) :
 * doit exister dans l'UL de la tâche et être ouvert, sinon 400. Le dossier actuel
 * d'une tâche (même clos) n'est pas revérifié : l'appelant ne l'envoie pas ici.
 * Renvoie la ligne du dossier (ou `null` sans dossier) ou la réponse à renvoyer.
 */
export async function checkTaskDossier(
    ulId: string,
    dossierId: string | null | undefined,
): Promise<{ ok: true; dossier: DossierRow | null } | { ok: false; response: NextResponse }> {
    if (!dossierId) return { ok: true, dossier: null };
    const row = await getDossierRow(dossierId);
    if (!row || row.ulId !== ulId) {
        return { ok: false, response: NextResponse.json({ error: 'Dossier invalide : introuvable ou hors de votre UL.' }, { status: 400 }) };
    }
    if (row.status === 'CLOSED') {
        return { ok: false, response: NextResponse.json({ error: 'Ce dossier est clos : rouvrez-le pour y ranger une tâche.' }, { status: 400 }) };
    }
    return { ok: true, dossier: row };
}

/**
 * Rattachements d'une tâche qui entre dans un dossier : ajoute les véhicules du
 * dossier qui manquent, s'ils sont toujours dans l'UL, dans l'ordre du dossier et tant
 * que la liste n'est pas pleine (`MAX_TASK_LINKS`). `null` : rien à ajouter.
 */
export async function withDossierVehicleLink(ulId: string, dossier: DossierRow, links: TaskLinkInput[]): Promise<TaskLinkInput[] | null> {
    const missing = dossier.vehicleIds.filter(id => !links.some(l => l.type === 'VEHICLE' && l.id === id));
    if (missing.length === 0 || links.length >= MAX_TASK_LINKS) return null;
    const inUl = await getUlVehicleIds(ulId, missing);
    const added = missing.filter(id => inUl.has(id)).slice(0, MAX_TASK_LINKS - links.length);
    if (added.length === 0) return null;
    return [...links, ...added.map(id => ({ type: 'VEHICLE' as const, id }))];
}

/**
 * Véhicules choisis pour un dossier : chacun doit être un véhicule de l'UL, ou déjà
 * porté par le dossier modifié (`current` ; un véhicule parti de l'UL peut y rester).
 * La réponse 400 à renvoyer, ou `null`.
 */
export async function checkDossierVehicles(ulId: string, vehicleIds: string[], current: string[] = []): Promise<NextResponse | null> {
    const toCheck = vehicleIds.filter(id => !current.includes(id));
    const inUl = await getUlVehicleIds(ulId, toCheck);
    if (toCheck.every(id => inUl.has(id))) return null;
    return NextResponse.json({ error: 'Véhicule invalide : introuvable ou hors de votre UL.' }, { status: 400 });
}
