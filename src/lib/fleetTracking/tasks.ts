import { z } from 'zod';

/**
 * Tâches du suivi technique : états, priorités, rattachements, schémas de
 * validation, types exposés par l'API et petites règles d'affichage.
 *
 * Module pur (aucun accès base, aucune session) : importé à la fois par les routes
 * et par les composants client.
 */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
    TODO: 'À faire',
    IN_PROGRESS: 'En cours',
    WAITING: 'En attente',
    DONE: 'Terminé',
};

export const TASK_PRIORITIES = ['NORMAL', 'HIGH'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
    NORMAL: 'Normale',
    HIGH: 'Prioritaire',
};

export const LINK_TYPES = ['VEHICLE', 'CONTACT', 'INCIDENT', 'MAINTENANCE'] as const;
export type LinkType = typeof LINK_TYPES[number];

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
    VEHICLE: 'Véhicule',
    CONTACT: 'Contact',
    INCIDENT: 'Incident',
    MAINTENANCE: 'Maintenance',
};

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_DESCRIPTION = 5000;
export const MAX_TASK_ASSIGNEES = 20;
export const MAX_TASK_LINKS = 30;
/** Cartes « Terminé » affichées avant « Afficher les N autres ». */
export const DONE_COLLAPSE_LIMIT = 5;

export interface TaskAssignee {
    id: string;
    name: string;
}

/**
 * Rattachement résolu. `missing` : la cible n'existe plus ou n'est plus visible
 * depuis l'UL (contact retiré du partage…) — le lien reste, sans détail.
 */
export interface TaskLink {
    type: LinkType;
    id: string;
    label: string;
    detail: string | null;
    /** Contact : premier numéro, pour l'appeler depuis la tâche. */
    phone: string | null;
    /** Véhicule : nom, pour ouvrir sa fiche. */
    vehicleName: string | null;
    missing: boolean;
}

export interface FleetTask {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
    pinned: boolean;
    dossierId: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignees: TaskAssignee[];
    links: TaskLink[];
    attachmentCount: number;
}

export interface TaskAttachment {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
    uploadedByName: string | null;
    createdAt: string;
}

export interface FleetTaskDetail extends FleetTask {
    attachments: TaskAttachment[];
}

/** Personne assignable : responsable véhicule ou admin actif de l'UL. */
export interface AssignableManager {
    id: string;
    name: string;
    email: string;
    roleLabel: string;
}

/** Cible proposée par la recherche de rattachements. */
export interface LinkTarget {
    type: LinkType;
    id: string;
    label: string;
    detail: string | null;
}

// ── Validation ───────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date calendaire réelle `YYYY-MM-DD` (refuse 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
    if (!DATE_RE.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Vide → `null` ; absent reste absent (une modification partielle ne l'efface pas). */
const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

const linkSchema = z.object({
    type: z.enum(LINK_TYPES),
    id: z.string().trim().min(1).max(100),
}).strict();

const taskFields = {
    title: z.string().trim().min(1, 'Titre requis').max(MAX_TASK_TITLE, `Titre limité à ${MAX_TASK_TITLE} caractères`),
    description: z.string().trim().max(MAX_TASK_DESCRIPTION, `Description limitée à ${MAX_TASK_DESCRIPTION} caractères`)
        .nullable().optional().transform(emptyToNull),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: z.union([z.literal(''), z.string().refine(isValidIsoDate, 'Échéance invalide (AAAA-MM-JJ)')])
        .nullable().optional().transform(emptyToNull),
    pinned: z.boolean(),
    assigneeIds: z.array(z.string().trim().min(1).max(100)).max(MAX_TASK_ASSIGNEES, 'Trop d\'assignés'),
    links: z.array(linkSchema).max(MAX_TASK_LINKS, 'Trop de rattachements'),
    /** Dossier de rattachement (même UL), `null` hors dossier. */
    dossierId: z.string().trim().min(1).max(100).nullable(),
};

export const createTaskSchema = z.object({
    ...taskFields,
    status: taskFields.status.default('TODO'),
    priority: taskFields.priority.default('NORMAL'),
    pinned: taskFields.pinned.default(false),
    assigneeIds: taskFields.assigneeIds.default([]),
    links: taskFields.links.default([]),
    dossierId: taskFields.dossierId.optional(),
}).strict();

export const updateTaskSchema = z.object(taskFields).partial().strict()
    .refine(v => Object.values(v).some(x => x !== undefined), 'Aucune modification');

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskLinkInput = z.infer<typeof linkSchema>;

/** Filtres de la liste (`GET /api/fleet-tracking/tasks?…`). Valeurs vides ignorées. */
export const taskFiltersSchema = z.object({
    vehicle: z.string().trim().max(100).optional(),
    assignee: z.string().trim().max(100).optional(),
    pinned: z.enum(['1', 'true']).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.string().optional()
        .refine(v => !v || v.split(',').every(s => (TASK_STATUSES as readonly string[]).includes(s)), 'État inconnu'),
    q: z.string().trim().max(200).optional(),
    /** Identifiant d'un dossier, ou `none` : tâches hors dossier. */
    dossier: z.string().trim().max(100).optional(),
    /** `soon` : tâches non terminées à échéance ≤ aujourd'hui + 30 j (Europe/Paris), dépassées comprises. */
    due: z.enum(['soon']).optional(),
});

export type TaskFilters = z.infer<typeof taskFiltersSchema>;

/** Paramètres de requête → objet de filtres (chaînes vides retirées). */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of params) if (v.trim() !== '') out[k] = v;
    return out;
}

/** Ensemble dédoublonné de rattachements (type + id). */
export function dedupeLinks(links: TaskLinkInput[]): TaskLinkInput[] {
    const seen = new Set<string>();
    return links.filter(l => {
        const key = `${l.type}:${l.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Affichage ────────────────────────────────────────────────────

/** `YYYY-MM-DD…` → `JJ/MM/AAAA` (sinon la valeur telle quelle). */
export function formatFrDate(value: string | null | undefined): string {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** Échéance courte `JJ/MM`, ou « Date à fixer ». */
export function formatDueDate(dueDate: string | null): string {
    if (!dueDate) return 'Date à fixer';
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dueDate);
    return m ? `${m[2]}/${m[1]}` : dueDate;
}

/**
 * Urgence d'une échéance : `overdue` (dépassée ou ≤ 7 j), `soon` (≤ 30 j),
 * `later`, ou `null` sans échéance. `today` au format `YYYY-MM-DD`.
 */
export function dueTone(dueDate: string | null, today: string): 'overdue' | 'soon' | 'later' | null {
    if (!dueDate || !isValidIsoDate(dueDate) || !isValidIsoDate(today)) return null;
    const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (days <= 7) return 'overdue';
    if (days <= 30) return 'soon';
    return 'later';
}

/** Date locale du jour `YYYY-MM-DD`. */
export function todayIso(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Initiales d'une personne (« Camille Roux » → « CR »). */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last).toUpperCase();
}

/**
 * Ordre d'affichage d'une colonne (pas d'ordre manuel) : épinglées, puis
 * prioritaires, puis échéance la plus proche (sans échéance en dernier), puis les
 * plus récentes. « Terminé » : les plus récemment terminées d'abord.
 */
export function compareTasks(a: FleetTask, b: FleetTask): number {
    if (a.status === 'DONE' && b.status === 'DONE') {
        return (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.createdAt.localeCompare(a.createdAt);
    }
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.priority !== b.priority) return a.priority === 'HIGH' ? -1 : 1;
    if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
}

/** Tâches regroupées par état, chaque groupe trié par `compareTasks`. */
export function groupTasksByStatus(tasks: FleetTask[]): Record<TaskStatus, FleetTask[]> {
    const groups: Record<TaskStatus, FleetTask[]> = { TODO: [], IN_PROGRESS: [], WAITING: [], DONE: [] };
    for (const t of tasks) groups[t.status]?.push(t);
    for (const s of TASK_STATUSES) groups[s].sort(compareTasks);
    return groups;
}

/** Type des données glissées d'une carte : un texte externe déposé n'est jamais pris pour une tâche. */
export const TASK_DRAG_MIME = 'application/x-fleet-task';

/** Lien profond vers une tâche (notification, partage). */
export function taskDeepLink(taskId: string): string {
    return `/vehicles?vue=suivi&onglet=taches&tache=${encodeURIComponent(taskId)}`;
}
