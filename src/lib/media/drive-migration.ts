/**
 * Migration des médias Google Drive vers R2 (photos de trajet, d'incident, de
 * communication de mission, rapport de mission signé).
 *
 * Utilisé par `scripts/migrate-drive-images-to-r2.ts` ; la copie d'un dossier de
 * trajet (`collectDriveSources` + `copyDriveSources`) sert aussi à
 * `POST /api/media/upload` pour le rendu d'un trajet emprunté avant la bascule.
 * Les accès Drive, R2 et SQL sont INJECTÉS : la logique se teste sans réseau.
 *
 * Pour chaque id Drive (une ou plusieurs lignes, éventuellement de types
 * différents — un seul groupe, jamais traité deux fois) :
 *   1. lit le dossier (ou le fichier, pour le rapport signé) et son `createdTime` ;
 *   2. calcule, pour chaque type, la référence R2 `{type}/{UL}/{nom}-{horodatage}-{xxxx}` ;
 *      suffixe et noms de fichiers dérivés de l'id Drive : le dry-run annonce
 *      exactement ce que `apply` écrira ;
 *   3. avec `apply` : copie chaque fichier, puis repointe la colonne par un UPDATE
 *      gardé `WHERE col = <id Drive>` ;
 *   4. avec `deleteOld` : met l'original Drive à la corbeille, APRÈS tous les UPDATE
 *      réussis et seulement si TOUS ses fichiers ont été copiés.
 *
 * Un fichier illisible fait sauter la référence (aucun UPDATE, Drive intact). Une
 * ligne sans UL, ou un dossier partagé entre UL différentes, est signalé et sauté,
 * jamais fusionné. Les ids `mock-…` (preview) sont ignorés et signalés. Une
 * référence déjà R2 (contient `/`) n'est jamais sélectionnée : idempotente.
 */

import { createHash } from 'node:crypto';
import {
    buildMediaFileKey,
    buildMediaFolderRef,
    fileNameWithMimeExtension,
    isR2Ref,
    readableSegment,
    type MediaType,
    type TripStage,
} from '@/lib/media/refs';

export type MigrationKind = 'trip' | 'incident' | 'mission-com' | 'mission-report';

interface KindSpec {
    type: MediaType;
    table: string;
    column: string;
    label: string;
}

export const MIGRATION_KINDS: Record<MigrationKind, KindSpec> = {
    trip: { type: 'trip-photos', table: 'Trip', column: 'driveFolderId', label: 'trajet' },
    incident: { type: 'incident-photos', table: 'IncidentReport', column: 'driveFolderId', label: 'incident' },
    'mission-com': { type: 'mission-com-photos', table: 'mission_reports', column: 'drive_folder_id', label: 'photos de mission' },
    'mission-report': { type: 'mission-report-photo', table: 'mission_reports', column: 'signed_report_drive_id', label: 'rapport signé' },
};

/** Une ligne lue en base, avant regroupement. */
export interface MigrationRow {
    kind: MigrationKind;
    rowId: string;
    driveId: string;
    /** Segment UL déjà assaini (`toMediaUlSegment(expenseUlSegment(…))`), `null` si la ligne n'a pas d'UL. */
    ulSegment: string | null;
    /** Nom lisible : véhicule ou mission. */
    name: string;
}

/** Les lignes d'un même type qui portent l'id Drive. */
export interface MigrationTarget {
    kind: MigrationKind;
    rowIds: string[];
    name: string;
}

/** Un id Drive à migrer, toutes lignes et tous types confondus. */
export interface MigrationGroup {
    driveId: string;
    targets: MigrationTarget[];
    /** UL commune à toutes les lignes ; `null` si une ligne n'a pas d'UL. */
    ulSegment: string | null;
    /** Plusieurs UL distinctes : groupe sauté. */
    ulConflict: string[] | null;
}

export interface DriveItem {
    id: string;
    name: string;
    mimeType: string;
    createdTime?: string | null;
}

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveSource {
    /** Métadonnées d'un dossier ou fichier ; `null` si introuvable (404). */
    get(id: string): Promise<DriveItem | null>;
    /** Enfants non supprimés d'un dossier. */
    list(folderId: string): Promise<DriveItem[]>;
    download(fileId: string): Promise<Buffer>;
    trash(id: string): Promise<void>;
}

export interface MediaSink {
    put(key: string, body: Buffer, contentType: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface DriveMigrationDeps {
    drive: DriveSource;
    r2: MediaSink;
    execute(stmt: { sql: string; args: string[] }): Promise<{ rowsAffected: number }>;
    /** Date de repli si Drive ne donne pas de `createdTime`. */
    now?: () => Date;
}

export interface MigrationOptions {
    apply: boolean;
    deleteOld: boolean;
}

export interface PlannedFile {
    driveId: string;
    name: string;
    key: string;
}

export type MigrationStatus = 'migrated' | 'planned' | 'ignored' | 'skipped' | 'error';

export interface TargetResult {
    kind: MigrationKind;
    table: string;
    column: string;
    rowIds: string[];
    /** Future (ou nouvelle) valeur de la colonne. */
    newRef: string | null;
    files: PlannedFile[];
    /** UPDATE effectué (apply). */
    updated: boolean;
}

export interface MigrationResult {
    driveId: string;
    status: MigrationStatus;
    targets: TargetResult[];
    /** Original Drive mis à la corbeille. */
    trashed: boolean;
    /** Fichiers Drive non repris (hors type, sous-dossier inattendu) : le dossier Drive est conservé. */
    ignoredFiles: string[];
    reason?: string;
}

/** Regroupe les lignes par id Drive (tous types), en signalant UL absentes ou multiples. */
export function groupMigrationRows(rows: MigrationRow[]): MigrationGroup[] {
    const groups = new Map<string, { driveId: string; targets: Map<MigrationKind, MigrationTarget>; segments: Set<string | null> }>();
    for (const row of rows) {
        if (!row.driveId || isR2Ref(row.driveId)) continue;
        let g = groups.get(row.driveId);
        if (!g) {
            g = { driveId: row.driveId, targets: new Map(), segments: new Set() };
            groups.set(row.driveId, g);
        }
        g.segments.add(row.ulSegment);
        const t = g.targets.get(row.kind);
        if (t) {
            if (!t.rowIds.includes(row.rowId)) t.rowIds.push(row.rowId);
        } else {
            g.targets.set(row.kind, { kind: row.kind, rowIds: [row.rowId], name: row.name });
        }
    }
    return [...groups.values()].map((g) => {
        const segments = [...g.segments];
        const named = segments.filter((s): s is string => s !== null);
        return {
            driveId: g.driveId,
            targets: [...g.targets.values()],
            ulSegment: segments.includes(null) || named.length !== 1 ? null : named[0],
            ulConflict: named.length > 1 ? named.sort() : null,
        };
    });
}

/** Empreinte hexadécimale stable d'une chaîne (noms déterministes). */
export function stableHex(value: string, length: number): string {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function isImage(item: DriveItem): boolean {
    return item.mimeType.startsWith('image/');
}

function isImageOrPdf(item: DriveItem): boolean {
    return isImage(item) || item.mimeType === 'application/pdf';
}

/** Nom de fichier avec extension (déduite du type MIME si absente ou inconnue). */
export function fileNameWithExtension(item: DriveItem): string {
    return fileNameWithMimeExtension(item.name, item.mimeType);
}

export interface SourceFile {
    item: DriveItem;
    stage: TripStage | null;
}

/** Fichiers à reprendre selon le type, et ceux laissés de côté. */
export async function collectDriveSources(kind: MigrationKind, root: DriveItem, drive: DriveSource): Promise<{ sources: SourceFile[]; ignored: string[] }> {
    const sources: SourceFile[] = [];
    const ignored: string[] = [];

    if (kind === 'mission-report') {
        if (root.mimeType === DRIVE_FOLDER_MIME || !isImageOrPdf(root)) {
            throw new Error(`le rapport signé n'est pas une image ni un PDF (${root.mimeType})`);
        }
        return { sources: [{ item: root, stage: null }], ignored };
    }

    if (root.mimeType !== DRIVE_FOLDER_MIME) {
        throw new Error(`la référence Drive n'est pas un dossier (${root.mimeType})`);
    }
    const children = await drive.list(root.id);

    if (kind === 'trip') {
        for (const child of children) {
            const stage = child.name.trim().toLowerCase();
            if (child.mimeType === DRIVE_FOLDER_MIME && (stage === 'emprunt' || stage === 'rendu')) {
                for (const file of await drive.list(child.id)) {
                    if (file.mimeType !== DRIVE_FOLDER_MIME && isImage(file)) sources.push({ item: file, stage });
                    else ignored.push(`${child.name}/${file.name}`);
                }
            } else {
                ignored.push(child.name);
            }
        }
        return { sources, ignored };
    }

    if (kind === 'incident') {
        // Photos directement dans le dossier ; ancien format : sous-dossiers `incident-…`.
        for (const child of children) {
            if (child.mimeType === DRIVE_FOLDER_MIME) {
                for (const file of await drive.list(child.id)) {
                    if (file.mimeType !== DRIVE_FOLDER_MIME && isImage(file)) sources.push({ item: file, stage: null });
                    else ignored.push(`${child.name}/${file.name}`);
                }
            } else if (isImage(child)) {
                sources.push({ item: child, stage: null });
            } else {
                ignored.push(child.name);
            }
        }
        return { sources, ignored };
    }

    // Photos de communication de mission : dossier plat, images et PDF.
    for (const child of children) {
        if (child.mimeType !== DRIVE_FOLDER_MIME && isImageOrPdf(child)) sources.push({ item: child, stage: null });
        else ignored.push(child.name);
    }
    return { sources, ignored };
}

/** Clés R2 des fichiers sources sous `folderRef` ; uuid8 dérivé de l'id Drive si `deterministic`. */
export function planDriveFiles(sources: SourceFile[], folderRef: string, deterministic: boolean): PlannedFile[] {
    return sources.map(({ item, stage }) => ({
        driveId: item.id,
        name: item.name,
        key: buildMediaFileKey(folderRef, fileNameWithExtension(item), { stage, id: deterministic ? stableHex(item.id, 8) : undefined }),
    }));
}

/**
 * Copie les fichiers planifiés de Drive vers R2 : tout ou rien. Au premier fichier
 * illisible, les objets déjà écrits sont retirés et l'erreur est relevée.
 */
export async function copyDriveSources(
    sources: SourceFile[],
    files: PlannedFile[],
    deps: { drive: DriveSource; r2: MediaSink },
): Promise<string[]> {
    const written: string[] = [];
    try {
        for (let i = 0; i < sources.length; i++) {
            const { item } = sources[i];
            let body: Buffer;
            try {
                body = await deps.drive.download(item.id);
            } catch (e: unknown) {
                throw new Error(`fichier illisible « ${item.name} » (${e instanceof Error ? e.message : String(e)})`);
            }
            await deps.r2.put(files[i].key, body, item.mimeType || 'application/octet-stream');
            written.push(files[i].key);
        }
        return written;
    } catch (e: unknown) {
        await cleanup(written, deps.r2);
        throw e;
    }
}

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export async function migrateGroup(group: MigrationGroup, deps: DriveMigrationDeps, opts: MigrationOptions): Promise<MigrationResult> {
    const result: MigrationResult = {
        driveId: group.driveId,
        status: opts.apply ? 'migrated' : 'planned',
        targets: group.targets.map((t) => ({
            kind: t.kind, table: MIGRATION_KINDS[t.kind].table, column: MIGRATION_KINDS[t.kind].column,
            rowIds: t.rowIds, newRef: null, files: [], updated: false,
        })),
        trashed: false,
        ignoredFiles: [],
    };

    if (group.driveId.startsWith('mock-')) {
        return { ...result, status: 'ignored', reason: 'id factice (mock-…, preview) : ignoré' };
    }
    if (group.ulConflict) {
        return { ...result, status: 'skipped', reason: `dossier partagé entre plusieurs UL (${group.ulConflict.join(', ')}) : non fusionné` };
    }
    if (!group.ulSegment) {
        return { ...result, status: 'skipped', reason: 'ligne sans UL : impossible de ranger le dossier' };
    }
    const ulSegment = group.ulSegment;

    const written: string[] = [];
    try {
        const root = await deps.drive.get(group.driveId);
        if (!root) return { ...result, status: 'error', reason: 'introuvable sur Drive' };

        const date = parseDate(root.createdTime) ?? (deps.now ? deps.now() : new Date());
        const suffix = stableHex(group.driveId, 4);
        const plans: { target: TargetResult; sources: SourceFile[] }[] = [];
        for (const target of result.targets) {
            const spec = MIGRATION_KINDS[target.kind];
            const name = group.targets.find((t) => t.kind === target.kind)?.name ?? '';
            const folderRef = buildMediaFolderRef(spec.type, ulSegment, readableSegment(name, date, suffix));
            const { sources, ignored } = await collectDriveSources(target.kind, root, deps.drive);
            for (const f of ignored) if (!result.ignoredFiles.includes(f)) result.ignoredFiles.push(f);
            target.files = planDriveFiles(sources, folderRef, true);
            if (target.kind === 'mission-report') {
                target.newRef = target.files[0]?.key ?? null;
                if (!target.newRef) return { ...result, status: 'error', reason: 'rapport signé sans fichier' };
            } else {
                target.newRef = folderRef;
            }
            plans.push({ target, sources });
        }

        if (!opts.apply) {
            if (opts.deleteOld && result.ignoredFiles.length) result.reason = 'des fichiers ne seraient pas repris : dossier Drive conservé';
            return result;
        }

        // 1. Copie : tout ou rien, pour tous les types du groupe.
        for (const { target, sources } of plans) {
            try {
                written.push(...await copyDriveSources(sources, target.files, deps));
            } catch (e: unknown) {
                await cleanup(written, deps.r2);
                return { ...result, status: 'error', reason: `${e instanceof Error ? e.message : String(e)} — Drive intact` };
            }
        }

        // 2. Base : UPDATE gardé (une ligne modifiée entre-temps n'est pas touchée).
        let updatedAny = false;
        let allUpdated = true;
        for (const { target } of plans) {
            const res = await deps.execute({
                sql: `UPDATE "${target.table}" SET ${target.column} = ? WHERE ${target.column} = ?`,
                args: [target.newRef as string, group.driveId],
            });
            target.updated = res.rowsAffected > 0;
            updatedAny ||= target.updated;
            allUpdated &&= target.updated;
        }
        if (!updatedAny) {
            await cleanup(written, deps.r2);
            return { ...result, status: 'skipped', reason: 'référence modifiée entre-temps, non migrée' };
        }

        // 3. Corbeille Drive : seulement si tout a été copié ET repointé.
        if (opts.deleteOld) {
            if (result.ignoredFiles.length) {
                result.reason = 'des fichiers n\'ont pas été repris : dossier Drive conservé';
            } else if (!allUpdated) {
                result.reason = 'une partie des lignes a changé entre-temps : dossier Drive conservé';
            } else {
                try {
                    await deps.drive.trash(group.driveId);
                    result.trashed = true;
                } catch (e: unknown) {
                    result.reason = `migré, mais mise à la corbeille Drive impossible (${e instanceof Error ? e.message : String(e)})`;
                }
            }
        }
        return result;
    } catch (e: unknown) {
        await cleanup(written, deps.r2);
        return { ...result, status: 'error', reason: e instanceof Error ? e.message : String(e) };
    }
}

/** Entrées du journal persistant d'une exécution `--apply` (une par ligne repointée). */
export interface MigrationJournalEntry {
    table: string;
    rowId: string;
    oldId: string;
    newRef: string;
    trashed: boolean;
}

export function journalEntries(result: MigrationResult): MigrationJournalEntry[] {
    return result.targets.flatMap((t) => (t.updated && t.newRef
        ? t.rowIds.map((rowId) => ({ table: t.table, rowId, oldId: result.driveId, newRef: t.newRef as string, trashed: result.trashed }))
        : []));
}

/** Retire les objets R2 écrits pour une référence qui n'a pas basculé (best-effort). */
async function cleanup(keys: string[], r2: MediaSink): Promise<void> {
    for (const key of keys) {
        await r2.delete(key).catch(() => undefined);
    }
}
