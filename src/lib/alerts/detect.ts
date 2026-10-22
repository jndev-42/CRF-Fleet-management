/**
 * Détection pure des alertes d'échéance quotidiennes (désinfection VPSP, stock).
 * Aucun accès base ni horloge : « aujourd'hui » (`YYYY-MM-DD`, jour de Paris) est
 * toujours fourni par l'appelant, et les clés déjà envoyées aussi.
 */

/** Seuil « bientôt due » de la désinfection (orange sur la fiche véhicule). */
export const DESINF_SOON_DAYS = 14;
/** Rétention des clés d'alerte envoyées. */
export const ALERT_RETENTION_DAYS = 400;

export type DesinfStage = 'soon' | 'overdue';
export type BatchStage = 'soon' | 'expired';

export interface DesinfVehicle {
    id: string;
    name: string;
    ulId: string;
    nextDesinfMaxDate: string;
}

export interface StockBatch {
    batchId: string;
    itemId: string;
    itemName: string;
    ulId: string;
    expiryDate: string;
}

export interface StockItem {
    id: string;
    name: string;
    ulId: string;
    quantity: number;
    minStock: number | null;
}

export interface DesinfAlert {
    key: string;
    stage: DesinfStage;
    vehicle: DesinfVehicle;
}

export interface StockDigest {
    ulId: string;
    soonBatches: StockBatch[];
    expiredBatches: StockBatch[];
    lowItems: StockItem[];
    /** Clés à enregistrer une fois le résumé envoyé. */
    keys: string[];
}

export const desinfKey = (stage: DesinfStage, vehicleId: string, date: string) =>
    `desinf-${stage}:${vehicleId}:${date}`;
export const batchKey = (stage: BatchStage, batchId: string, date: string) =>
    `batch-${stage}:${batchId}:${date}`;
export const itemLowKey = (itemId: string) => `item-low:${itemId}`;
export const ITEM_LOW_PREFIX = 'item-low:';

/** Jour `YYYY-MM-DD` d'une valeur de base (10 premiers caractères), ou `null` si illisible. */
export function normalizeDay(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const day = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** `2026-11-05` -> `05/11/2026`. */
export function formatFrDay(day: string): string {
    const [y, m, d] = day.split('-');
    return `${d}/${m}/${y}`;
}

function parseDay(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function formatDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
    const date = parseDay(day);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDay(date);
}

/** Même calcul que la page « bientôt périmés » : +1 mois calendaire. */
export function addOneMonth(day: string): string {
    const date = parseDay(day);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return formatDay(date);
}

/** Alertes de désinfection à envoyer ; si l'échéance est dépassée, seule « dépassée » part. */
export function detectDesinfAlerts(vehicles: DesinfVehicle[], today: string, sentKeys: ReadonlySet<string>): DesinfAlert[] {
    const soonLimit = addDays(today, DESINF_SOON_DAYS);
    const alerts: DesinfAlert[] = [];
    for (const vehicle of vehicles) {
        const date = vehicle.nextDesinfMaxDate;
        const stage: DesinfStage | null = date < today ? 'overdue' : date <= soonLimit ? 'soon' : null;
        if (!stage) continue;
        const key = desinfKey(stage, vehicle.id, date);
        if (!sentKeys.has(key)) alerts.push({ key, stage, vehicle });
    }
    return alerts;
}

/** Résumés de stock nouveaux, un par UL (UL sans nouveauté absente du résultat). */
export function detectStockDigests(
    batches: StockBatch[],
    items: StockItem[],
    today: string,
    sentKeys: ReadonlySet<string>,
): StockDigest[] {
    const soonLimit = addOneMonth(today);
    const digests = new Map<string, StockDigest>();
    const digestFor = (ulId: string): StockDigest => {
        let digest = digests.get(ulId);
        if (!digest) {
            digest = { ulId, soonBatches: [], expiredBatches: [], lowItems: [], keys: [] };
            digests.set(ulId, digest);
        }
        return digest;
    };

    for (const batch of batches) {
        const stage: BatchStage | null = batch.expiryDate < today ? 'expired' : batch.expiryDate <= soonLimit ? 'soon' : null;
        if (!stage) continue;
        const key = batchKey(stage, batch.batchId, batch.expiryDate);
        if (sentKeys.has(key)) continue;
        const digest = digestFor(batch.ulId);
        (stage === 'expired' ? digest.expiredBatches : digest.soonBatches).push(batch);
        digest.keys.push(key);
    }

    for (const item of items) {
        if (!isLow(item)) continue;
        const key = itemLowKey(item.id);
        if (sentKeys.has(key)) continue;
        const digest = digestFor(item.ulId);
        digest.lowItems.push(item);
        digest.keys.push(key);
    }

    return Array.from(digests.values());
}

/** Toutes les clés correspondant à l'état courant, qu'elles aient déjà été envoyées ou non. */
export function activeAlertKeys(
    vehicles: DesinfVehicle[],
    batches: StockBatch[],
    items: StockItem[],
    today: string,
): Set<string> {
    const none = new Set<string>();
    return new Set([
        ...detectDesinfAlerts(vehicles, today, none).map(alert => alert.key),
        ...detectStockDigests(batches, items, today, none).flatMap(digest => digest.keys),
    ]);
}

/** Ne garde du résumé que les éléments dont la clé a été réservée par ce run. */
export function restrictDigest(digest: StockDigest, claimed: ReadonlySet<string>): StockDigest {
    return {
        ulId: digest.ulId,
        soonBatches: digest.soonBatches.filter(b => claimed.has(batchKey('soon', b.batchId, b.expiryDate))),
        expiredBatches: digest.expiredBatches.filter(b => claimed.has(batchKey('expired', b.batchId, b.expiryDate))),
        lowItems: digest.lowItems.filter(i => claimed.has(itemLowKey(i.id))),
        keys: digest.keys.filter(key => claimed.has(key)),
    };
}

export function isLow(item: Pick<StockItem, 'quantity' | 'minStock'>): boolean {
    return item.minStock !== null && item.quantity < item.minStock;
}

/** Clés `item-low` dont le produit n'est plus sous son minimum : à réinitialiser. */
export function staleItemLowKeys(sentKeys: Iterable<string>, lowItemIds: ReadonlySet<string>): string[] {
    const stale: string[] = [];
    for (const key of sentKeys) {
        if (key.startsWith(ITEM_LOW_PREFIX) && !lowItemIds.has(key.slice(ITEM_LOW_PREFIX.length))) stale.push(key);
    }
    return stale;
}

const plural = (count: number, singular: string, pluralForm: string) =>
    `${count} ${count > 1 ? pluralForm : singular}`;

const MAX_LISTED_NAMES = 3;

/** Message du résumé de stock : compteurs, puis les premiers noms. */
export function buildStockDigestMessage(digest: StockDigest): string {
    const counts: string[] = [];
    if (digest.soonBatches.length > 0) counts.push(plural(digest.soonBatches.length, 'lot bientôt périmé', 'lots bientôt périmés'));
    if (digest.expiredBatches.length > 0) counts.push(plural(digest.expiredBatches.length, 'lot périmé', 'lots périmés'));
    if (digest.lowItems.length > 0) counts.push(plural(digest.lowItems.length, 'produit sous le stock minimum', 'produits sous le stock minimum'));

    const names = Array.from(new Set([
        ...digest.soonBatches.map(b => b.itemName),
        ...digest.expiredBatches.map(b => b.itemName),
        ...digest.lowItems.map(i => i.name),
    ]));
    const listed = names.slice(0, MAX_LISTED_NAMES).join(', ');
    const rest = names.length - MAX_LISTED_NAMES;
    return `${counts.join(', ')}. ${listed}${rest > 0 ? ` et ${rest} autre${rest > 1 ? 's' : ''}` : ''}`;
}

export function buildStockDigestTitle(ulName: string | null): string {
    return ulName ? `Inventaire : alertes du jour (${ulName})` : 'Inventaire : alertes du jour';
}

export function buildDesinfMessage(alert: DesinfAlert): { title: string; message: string } {
    const { name, nextDesinfMaxDate } = alert.vehicle;
    return alert.stage === 'overdue'
        ? { title: `Désinfection dépassée : ${name}`, message: `La désinfection de ${name} devait être faite avant le ${formatFrDay(nextDesinfMaxDate)}.` }
        : { title: `Désinfection bientôt due : ${name}`, message: `La prochaine désinfection de ${name} est à faire avant le ${formatFrDay(nextDesinfMaxDate)}.` };
}
