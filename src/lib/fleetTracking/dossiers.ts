import { z } from 'zod';
import type { FleetTask, TaskAttachment } from './tasks';

/**
 * Dossiers du suivi technique (sinistre, panne…) : états, schémas de validation,
 * types exposés par l'API et petites règles d'affichage.
 *
 * Module pur (aucun accès base, aucune session) : importé à la fois par les routes
 * et par les composants client.
 */

export const DOSSIER_STATUSES = ['OPEN', 'CLOSED'] as const;
export type DossierStatus = typeof DOSSIER_STATUSES[number];

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
    OPEN: 'Ouvert',
    CLOSED: 'Clos',
};

export const MAX_DOSSIER_TITLE = 200;
export const MAX_DOSSIER_DESCRIPTION = 5000;
export const MAX_ITEM_LABEL = 200;
export const MAX_ITEM_VALUE = 500;
/** Pièces à récupérer au plus par dossier. */
export const MAX_DOSSIER_ITEMS = 50;
/** Véhicules au plus par dossier. */
export const MAX_DOSSIER_VEHICLES = 50;

// ── Types exposés par l'API ──────────────────────────────────────

export interface DossierVehicle {
    id: string;
    name: string;
    plate: string | null;
    /** Le véhicule n'est plus dans l'UL du dossier (changé d'UL, supprimé). */
    missing: boolean;
}

/** Dossier tel que listé (compteurs compris). */
export interface FleetDossier {
    id: string;
    title: string;
    description: string | null;
    status: DossierStatus;
    pinned: boolean;
    /** Véhicules du dossier (au moins un), dans l'ordre de choix. */
    vehicles: DossierVehicle[];
    createdByName: string | null;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    taskCount: number;
    /** Tâches non terminées. */
    openTaskCount: number;
    itemCount: number;
    /** Pièces à récupérer non reçues. */
    missingItemCount: number;
    attachmentCount: number;
}

/** Pièce à récupérer. */
export interface DossierItem {
    id: string;
    label: string;
    received: boolean;
    receivedValue: string | null;
    /** Pièce jointe du dossier désignée comme « fichier reçu ». */
    attachmentId: string | null;
    attachmentName: string | null;
    receivedAt: string | null;
    receivedByName: string | null;
    position: number;
    createdAt: string;
}

export interface FleetDossierDetail extends FleetDossier {
    items: DossierItem[];
    tasks: FleetTask[];
    attachments: TaskAttachment[];
}

/** Entrée de l'historique technique d'un véhicule. */
export type VehicleHistoryEntry =
    | { kind: 'DOSSIER'; date: string; dossier: FleetDossier }
    | { kind: 'TASK'; date: string; task: FleetTask };

// ── Validation ───────────────────────────────────────────────────

/** Vide → `null` ; absent reste absent (une modification partielle ne l'efface pas). */
const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

const idSchema = z.string().trim().min(1).max(100);

/** Véhicules d'un dossier : au moins un, sans doublon (ordre de choix conservé). */
const vehicleIdsSchema = z.array(z.string().trim().min(1, 'Véhicule requis').max(100))
    .min(1, 'Choisissez au moins un véhicule')
    .max(MAX_DOSSIER_VEHICLES, `${MAX_DOSSIER_VEHICLES} véhicules au plus par dossier`)
    .transform(ids => [...new Set(ids)]);

/** Ancienne forme `vehicleId` (un seul véhicule) acceptée à la création : convertie en `vehicleIds`. */
function legacyVehicleId(input: unknown): unknown {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const { vehicleId, ...rest } = input as Record<string, unknown>;
    if (vehicleId === undefined || 'vehicleIds' in rest) return input;
    return { ...rest, vehicleIds: [vehicleId] };
}

const dossierFields = {
    vehicleIds: vehicleIdsSchema,
    title: z.string().trim().min(1, 'Titre requis').max(MAX_DOSSIER_TITLE, `Titre limité à ${MAX_DOSSIER_TITLE} caractères`),
    description: z.string().trim().max(MAX_DOSSIER_DESCRIPTION, `Description limitée à ${MAX_DOSSIER_DESCRIPTION} caractères`)
        .nullable().optional().transform(emptyToNull),
    status: z.enum(DOSSIER_STATUSES),
    pinned: z.boolean(),
};

export const createDossierSchema = z.preprocess(legacyVehicleId, z.object({
    ...dossierFields,
    status: dossierFields.status.default('OPEN'),
    pinned: dossierFields.pinned.default(false),
}).strict());

/** `vehicleIds` remplace la liste des véhicules du dossier (au moins un). */
export const updateDossierSchema = z.object(dossierFields).partial().strict()
    .refine(v => Object.values(v).some(x => x !== undefined), 'Aucune modification');

export type CreateDossierInput = z.infer<typeof createDossierSchema>;
export type UpdateDossierInput = z.infer<typeof updateDossierSchema>;

const itemLabel = z.string().trim().min(1, 'Libellé requis').max(MAX_ITEM_LABEL, `Libellé limité à ${MAX_ITEM_LABEL} caractères`);

export const createItemSchema = z.object({ label: itemLabel }).strict();

/**
 * Modification d'une pièce à récupérer. `received: false` efface valeur, fichier,
 * date et auteur de réception (la pièce jointe reste dans le dossier). Valeur et
 * fichier ne s'enregistrent que sur une pièce reçue.
 */
export const updateItemSchema = z.object({
    label: itemLabel,
    received: z.boolean(),
    receivedValue: z.string().trim().max(MAX_ITEM_VALUE, `Valeur limitée à ${MAX_ITEM_VALUE} caractères`)
        .nullable().optional().transform(emptyToNull),
    attachmentId: idSchema.nullable(),
}).partial().strict()
    .refine(v => Object.values(v).some(x => x !== undefined), 'Aucune modification');

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** Filtres de la liste (`GET /api/fleet-tracking/dossiers?…`). */
export const dossierFiltersSchema = z.object({
    status: z.enum(DOSSIER_STATUSES).optional(),
    vehicle: idSchema.optional(),
    pinned: z.enum(['1', 'true']).optional(),
});

export type DossierFilters = z.infer<typeof dossierFiltersSchema>;

// ── Affichage ────────────────────────────────────────────────────

/**
 * Récapitulatif des pièces à récupérer : « 1 sur 2 manquantes », « Toutes reçues »,
 * ou `null` sans pièce.
 */
export function missingItemsLabel(items: { received: boolean }[]): string | null {
    if (items.length === 0) return null;
    const missing = items.filter(i => !i.received).length;
    return missing === 0 ? 'Toutes reçues' : `${missing} sur ${items.length} manquantes`;
}

/** « 2 tâches en cours · 1 pièce manquante » : résumé d'une ligne de dossier. */
export function dossierSummary(d: Pick<FleetDossier, 'status' | 'taskCount' | 'openTaskCount' | 'missingItemCount' | 'attachmentCount'>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    const parts: string[] = [];
    if (d.status === 'OPEN') {
        if (d.openTaskCount > 0) parts.push(plural(d.openTaskCount, 'tâche en cours', 'tâches en cours'));
        if (d.missingItemCount > 0) parts.push(plural(d.missingItemCount, 'pièce manquante', 'pièces manquantes'));
    } else if (d.taskCount > 0) {
        parts.push(plural(d.taskCount, 'tâche', 'tâches'));
    }
    if (d.attachmentCount > 0) parts.push(plural(d.attachmentCount, 'pièce jointe', 'pièces jointes'));
    return parts.join(' · ');
}

/** Ordre de la liste : épinglés, puis ouverts, puis les plus récents. */
export function compareDossiers(a: FleetDossier, b: FleetDossier): number {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
}

/** Véhicules encore dans l'UL du dossier (les autres n'ont plus de fiche à ouvrir). */
export function visibleVehicles(d: Pick<FleetDossier, 'vehicles'>): DossierVehicle[] {
    return d.vehicles.filter(v => !v.missing);
}

/** « VL 1, VL 2 » : noms des véhicules d'un dossier (« Véhicule indisponible » pour un véhicule parti). */
export function dossierVehicleNames(d: Pick<FleetDossier, 'vehicles'>): string {
    return d.vehicles.map(v => v.name).join(', ');
}

/** Lien profond vers un dossier. */
export function dossierDeepLink(dossierId: string): string {
    return `/vehicles?vue=suivi&onglet=dossiers&dossier=${encodeURIComponent(dossierId)}`;
}

/** Entrée de l'historique « en cours » (dossier ouvert, tâche non terminée) ou « clos / terminé ». */
export function isHistoryEntryActive(entry: VehicleHistoryEntry): boolean {
    return entry.kind === 'DOSSIER' ? entry.dossier.status === 'OPEN' : entry.task.status !== 'DONE';
}
