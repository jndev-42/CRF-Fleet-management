import { db } from '@/lib/db';
import type { Transaction } from '@libsql/client';
import { EXTERNAL_VEHICLES, MISSION_TYPE_LABELS, SUPPLIES_BY_CATEGORY, TEAM_DYNAMICS_LABELS, type SupplyCategory } from '@/lib/mission-supplies';
import { INTERVENTION_MODE_LABELS, INTERVENTION_NATURE_LABELS } from '@/lib/mission-interventions';
import { accidentDetailsToStore, type UpdateMissionReportInput } from './create-mission-report';

/**
 * Modification d'un compte rendu APRÈS envoi, avec historique.
 *
 * « Validation » = envoi : aucun statut n'est introduit, le rapport reste
 * modifiable. Chaque enregistrement qui change réellement au moins un champ
 * ajoute UNE ligne à `mission_report_edits` (qui, quand, champ par champ
 * ancienne → nouvelle valeur), rendue en libellés lisibles et figée au moment de
 * l'écriture : renommer un véhicule plus tard ne réécrit pas l'historique.
 *
 * Le contrôle d'accès reste À LA CHARGE DE LA ROUTE (`canEditMissionReport`).
 * Ne touche jamais au rattachement UL/DT, à l'auteur, à la date de soumission,
 * aux photos ni au rapport signé.
 */

/** Une modification d'un champ, déjà rendue en texte. */
export interface MissionReportChange {
    field: string;
    label: string;
    old: string;
    new: string;
}

/** État comparable d'un rapport : scalaires normalisés + consommables et répartition à plat. */
export interface MissionReportSnapshot {
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string;
    pegass_ok: boolean;
    vehicle_id: string | null;
    driver_id: string | null;
    victim_count: number;
    presence_ul: boolean | null;
    team_dynamics: string | null;
    all_found_place: boolean | null;
    member_difficulties: boolean | null;
    free_comment: string | null;
    mission_comment: string | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    volunteer_accident: boolean;
    volunteer_accident_details: string | null;
    /** `${category}__${item_name}` → quantité (> 0 uniquement). */
    supplies: Record<string, number>;
    /** Catégorie → quantité (> 0 uniquement). */
    intervention_types: Record<string, number>;
    intervention_natures: Record<string, number>;
}

/** Noms lisibles des véhicules et conducteurs, par identifiant. */
export interface MissionReportNames {
    vehicles?: Record<string, string>;
    drivers?: Record<string, string>;
}

type ScalarKind = 'text' | 'bool' | 'date' | 'number' | 'missionType' | 'teamDynamics' | 'vehicle' | 'driver';

/** Champs scalaires suivis, dans l'ordre du formulaire. */
const SCALAR_FIELDS: { field: keyof MissionReportSnapshot; label: string; kind: ScalarKind }[] = [
    { field: 'mission_type', label: 'Type de mission', kind: 'missionType' },
    { field: 'mission_name', label: 'Nom de la mission', kind: 'text' },
    { field: 'mission_date', label: 'Date', kind: 'date' },
    { field: 'location', label: 'Lieu', kind: 'text' },
    { field: 'victim_count', label: 'Nombre d\'intervention', kind: 'number' },
    { field: 'pegass_ok', label: 'Inscriptions Pegass à jour', kind: 'bool' },
    { field: 'volunteers', label: 'Bénévoles', kind: 'text' },
    { field: 'vehicle_id', label: 'Véhicule', kind: 'vehicle' },
    { field: 'driver_id', label: 'Chauffeur', kind: 'driver' },
    { field: 'presence_ul', label: 'Présence UL', kind: 'bool' },
    { field: 'team_dynamics', label: 'Dynamique d\'équipe', kind: 'teamDynamics' },
    { field: 'all_found_place', label: 'Chacun a trouvé sa place', kind: 'bool' },
    { field: 'member_difficulties', label: 'Membres en difficulté', kind: 'bool' },
    { field: 'free_comment', label: 'Commentaire sur l\'équipe', kind: 'text' },
    { field: 'had_acr', label: 'Arrêt cardio-respiratoire (ACR)', kind: 'bool' },
    { field: 'had_hemorrhage', label: 'Hémorragie grave', kind: 'bool' },
    { field: 'had_complex_care', label: 'Prise en charge complexe', kind: 'bool' },
    { field: 'needs_followup', label: 'Suivi nécessaire', kind: 'bool' },
    { field: 'volunteer_accident', label: 'Accident bénévole', kind: 'bool' },
    { field: 'volunteer_accident_details', label: 'Description de l\'accident', kind: 'text' },
    { field: 'mission_comment', label: 'Commentaire', kind: 'text' },
];

const EMPTY = '—';

/** Texte vide et `null` sont équivalents : ni l'un ni l'autre ne compte comme modification. */
function normalizeText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return value === '' ? null : value;
}

function renderScalar(kind: ScalarKind, value: unknown, names: MissionReportNames): string {
    if (value === null || value === undefined || value === '') return EMPTY;
    switch (kind) {
        case 'bool': return value ? 'Oui' : 'Non';
        case 'number': return String(value);
        case 'date': {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
            return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
        }
        case 'missionType': return MISSION_TYPE_LABELS[String(value)] ?? String(value);
        case 'teamDynamics': return TEAM_DYNAMICS_LABELS[String(value)] ?? String(value);
        case 'vehicle': {
            const id = String(value);
            return names.vehicles?.[id] ?? EXTERNAL_VEHICLES[id]?.name ?? id;
        }
        case 'driver': {
            const id = String(value);
            return names.drivers?.[id] ?? id;
        }
        default: return String(value);
    }
}

function supplyLabel(key: string): string {
    const sep = key.indexOf('__');
    const category = sep === -1 ? '' : key.slice(0, sep);
    const item = sep === -1 ? key : key.slice(sep + 2);
    const categoryLabel = SUPPLIES_BY_CATEGORY[category as SupplyCategory]?.label;
    return categoryLabel ? `${categoryLabel} — ${item}` : item;
}

/** Compare deux grilles « clé → quantité » : ajout `0 → n`, retrait `n → 0`. */
function diffQuantities(
    before: Record<string, number>,
    after: Record<string, number>,
    fieldPrefix: string,
    labelFor: (key: string) => string,
): MissionReportChange[] {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    const changes: MissionReportChange[] = [];
    for (const key of keys) {
        const oldQty = before[key] ?? 0;
        const newQty = after[key] ?? 0;
        if (oldQty !== newQty) {
            changes.push({ field: `${fieldPrefix}.${key}`, label: labelFor(key), old: String(oldQty), new: String(newQty) });
        }
    }
    return changes;
}

/**
 * Liste des champs modifiés entre deux états d'un rapport, valeurs rendues en
 * libellés lisibles. Fonction pure : les noms de véhicule / conducteur sont
 * fournis par l'appelant. Tableau vide = aucune modification réelle.
 */
export function diffMissionReport(
    before: MissionReportSnapshot,
    after: MissionReportSnapshot,
    names: MissionReportNames = {},
): MissionReportChange[] {
    const changes: MissionReportChange[] = [];
    for (const { field, label, kind } of SCALAR_FIELDS) {
        const rawOld = before[field];
        const rawNew = after[field];
        const oldValue = typeof rawOld === 'string' || rawOld === null || rawOld === undefined ? normalizeText(rawOld as string | null) : rawOld;
        const newValue = typeof rawNew === 'string' || rawNew === null || rawNew === undefined ? normalizeText(rawNew as string | null) : rawNew;
        if (oldValue === newValue) continue;
        changes.push({
            field,
            label,
            old: renderScalar(kind, oldValue, names),
            new: renderScalar(kind, newValue, names),
        });
    }
    changes.push(...diffQuantities(before.supplies, after.supplies, 'supplies', supplyLabel));
    changes.push(...diffQuantities(
        before.intervention_types, after.intervention_types, 'intervention_types',
        key => `Répartition par type — ${INTERVENTION_MODE_LABELS[key as keyof typeof INTERVENTION_MODE_LABELS] ?? key}`,
    ));
    changes.push(...diffQuantities(
        before.intervention_natures, after.intervention_natures, 'intervention_natures',
        key => `Répartition par nature — ${INTERVENTION_NATURE_LABELS[key as keyof typeof INTERVENTION_NATURE_LABELS] ?? key}`,
    ));
    return changes;
}

const nullableBool = (v: unknown): boolean | null => (v === null || v === undefined ? null : Boolean(Number(v)));

/** Construit l'état comparable à partir du payload validé (même normalisation que l'écriture). */
export function snapshotFromInput(data: UpdateMissionReportInput, driverId: string | null): MissionReportSnapshot {
    const supplies: Record<string, number> = {};
    for (const s of data.supplies) {
        if (s.quantity_used > 0) {
            const key = `${s.category}__${s.item_name}`;
            supplies[key] = (supplies[key] ?? 0) + s.quantity_used;
        }
    }
    const toMap = (entries: { category: string; quantity: number }[]) => {
        const out: Record<string, number> = {};
        for (const e of entries) if (e.quantity > 0) out[e.category] = e.quantity;
        return out;
    };
    return {
        mission_type: data.mission_type,
        mission_name: data.mission_name,
        mission_date: data.mission_date,
        location: data.location,
        volunteers: data.volunteers,
        pegass_ok: data.pegass_ok,
        vehicle_id: data.vehicle_id ?? null,
        driver_id: driverId,
        victim_count: data.victim_count,
        presence_ul: data.presence_ul ?? null,
        team_dynamics: data.team_dynamics ?? null,
        all_found_place: data.all_found_place ?? null,
        member_difficulties: data.member_difficulties ?? null,
        free_comment: data.free_comment ?? null,
        mission_comment: data.mission_comment ?? null,
        had_acr: data.had_acr,
        had_hemorrhage: data.had_hemorrhage,
        had_complex_care: data.had_complex_care,
        needs_followup: data.needs_followup,
        volunteer_accident: data.volunteer_accident,
        volunteer_accident_details: accidentDetailsToStore(data),
        supplies,
        // À 0 intervention, aucune répartition n'est stockée (invariant du schéma).
        intervention_types: data.victim_count >= 1 ? toMap(data.intervention_types) : {},
        intervention_natures: data.victim_count >= 1 ? toMap(data.intervention_natures) : {},
    };
}

type Executor = Pick<Transaction, 'execute'>;

/** Relit l'état comparable d'un rapport en base, ou `null` s'il n'existe pas. */
async function loadSnapshot(exec: Executor, id: string): Promise<MissionReportSnapshot | null> {
    const res = await exec.execute({ sql: `SELECT * FROM "mission_reports" WHERE id = ?`, args: [id] });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const suppliesRes = await exec.execute({
        sql: `SELECT category, item_name, quantity_used FROM "mission_report_supplies" WHERE report_id = ?`,
        args: [id],
    });
    const supplies: Record<string, number> = {};
    for (const s of suppliesRes.rows) {
        const qty = Number(s.quantity_used);
        if (qty > 0) {
            const key = `${s.category as string}__${s.item_name as string}`;
            supplies[key] = (supplies[key] ?? 0) + qty;
        }
    }

    const interventionsRes = await exec.execute({
        sql: `SELECT breakdown, category, quantity FROM "mission_report_interventions" WHERE report_id = ?`,
        args: [id],
    });
    const intervention_types: Record<string, number> = {};
    const intervention_natures: Record<string, number> = {};
    for (const i of interventionsRes.rows) {
        const qty = Number(i.quantity);
        if (qty <= 0) continue;
        const bucket = (i.breakdown as string) === 'NATURE' ? intervention_natures : intervention_types;
        bucket[i.category as string] = qty;
    }

    return {
        mission_type: row.mission_type as string,
        mission_name: row.mission_name as string,
        mission_date: row.mission_date as string,
        location: row.location as string,
        volunteers: (row.volunteers as string | null) ?? '',
        pegass_ok: Boolean(Number(row.pegass_ok)),
        vehicle_id: (row.vehicle_id as string | null) ?? null,
        driver_id: (row.driver_id as string | null) ?? null,
        victim_count: Number(row.victim_count),
        presence_ul: nullableBool(row.presence_ul),
        team_dynamics: (row.team_dynamics as string | null) ?? null,
        all_found_place: nullableBool(row.all_found_place),
        member_difficulties: nullableBool(row.member_difficulties),
        free_comment: (row.free_comment as string | null) ?? null,
        mission_comment: (row.mission_comment as string | null) ?? null,
        had_acr: Boolean(Number(row.had_acr)),
        had_hemorrhage: Boolean(Number(row.had_hemorrhage)),
        had_complex_care: Boolean(Number(row.had_complex_care)),
        needs_followup: Boolean(Number(row.needs_followup)),
        volunteer_accident: Boolean(Number(row.volunteer_accident ?? 0)),
        volunteer_accident_details: (row.volunteer_accident_details as string | null) ?? null,
        supplies,
        intervention_types,
        intervention_natures,
    };
}

/** Résout les noms des véhicules et conducteurs cités par les deux états (libellés figés). */
async function resolveNames(exec: Executor, snapshots: MissionReportSnapshot[]): Promise<MissionReportNames> {
    const vehicleIds = Array.from(new Set(snapshots.map(s => s.vehicle_id).filter((v): v is string => Boolean(v))));
    const driverIds = Array.from(new Set(snapshots.map(s => s.driver_id).filter((v): v is string => Boolean(v))));
    const names: MissionReportNames = { vehicles: {}, drivers: {} };
    if (vehicleIds.length > 0) {
        const res = await exec.execute({
            sql: `SELECT id, name FROM "Vehicle" WHERE id IN (${vehicleIds.map(() => '?').join(',')})`,
            args: vehicleIds,
        });
        for (const r of res.rows) names.vehicles![r.id as string] = r.name as string;
    }
    if (driverIds.length > 0) {
        const res = await exec.execute({
            sql: `SELECT id, name, email FROM "User" WHERE id IN (${driverIds.map(() => '?').join(',')})`,
            args: driverIds,
        });
        for (const r of res.rows) names.drivers![r.id as string] = (r.name as string | null) || (r.email as string);
    }
    return names;
}

export type UpdateMissionReportResult =
    | { ok: false; status: 404; error: string }
    | {
        ok: true;
        /** Faux si le payload ne changeait rien : aucune écriture, aucune entrée d'historique. */
        changed: boolean;
        changes: MissionReportChange[];
        before: MissionReportSnapshot;
        after: MissionReportSnapshot;
    };

/**
 * Applique la modification, dans une seule transaction : relecture de l'état,
 * comparaison, puis (s'il y a au moins un changement) UPDATE du rapport,
 * remplacement des consommables et de la répartition, et ajout de l'entrée
 * d'historique au nom de `editorId`.
 *
 * @param editorId       `User.id` résolu de l'éditeur.
 * @param sessionUserId  `session.user.id` brut — peut être un email de repli en dev ;
 *                       sert uniquement à normaliser `driver_id` sur le vrai UUID.
 */
export async function updateMissionReport(
    id: string,
    data: UpdateMissionReportInput,
    editorId: string,
    sessionUserId?: string | null,
): Promise<UpdateMissionReportResult> {
    const rawDriverId = data.driver_id ?? null;
    const driverId = rawDriverId !== null && rawDriverId === sessionUserId ? editorId : rawDriverId;
    const after = snapshotFromInput(data, driverId);

    const tx = await db.transaction('write');
    try {
        const before = await loadSnapshot(tx, id);
        if (!before) {
            await tx.rollback();
            return { ok: false, status: 404, error: 'Compte rendu non trouvé' };
        }

        const names = await resolveNames(tx, [before, after]);
        const changes = diffMissionReport(before, after, names);
        if (changes.length === 0) {
            await tx.rollback();
            return { ok: true, changed: false, changes, before, after };
        }

        await tx.execute({
            sql: `UPDATE "mission_reports" SET
                mission_type = ?, mission_name = ?, mission_date = ?, location = ?, volunteers = ?,
                pegass_ok = ?, vehicle_id = ?, driver_id = ?, victim_count = ?, presence_ul = ?,
                team_dynamics = ?, all_found_place = ?, member_difficulties = ?, free_comment = ?,
                mission_comment = ?, had_acr = ?, had_hemorrhage = ?, had_complex_care = ?,
                needs_followup = ?, volunteer_accident = ?, volunteer_accident_details = ?
                WHERE id = ?`,
            args: [
                after.mission_type,
                after.mission_name,
                after.mission_date,
                after.location,
                after.volunteers,
                after.pegass_ok ? 1 : 0,
                after.vehicle_id,
                after.driver_id,
                after.victim_count,
                after.presence_ul === null ? null : (after.presence_ul ? 1 : 0),
                after.team_dynamics,
                after.all_found_place === null ? null : (after.all_found_place ? 1 : 0),
                after.member_difficulties === null ? null : (after.member_difficulties ? 1 : 0),
                after.free_comment,
                after.mission_comment,
                after.had_acr ? 1 : 0,
                after.had_hemorrhage ? 1 : 0,
                after.had_complex_care ? 1 : 0,
                after.needs_followup ? 1 : 0,
                after.volunteer_accident ? 1 : 0,
                after.volunteer_accident_details,
                id,
            ],
        });

        await tx.execute({ sql: `DELETE FROM "mission_report_supplies" WHERE report_id = ?`, args: [id] });
        for (const supply of data.supplies) {
            if (supply.quantity_used > 0) {
                await tx.execute({
                    sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), id, supply.category, supply.item_name, supply.quantity_used],
                });
            }
        }

        await tx.execute({ sql: `DELETE FROM "mission_report_interventions" WHERE report_id = ?`, args: [id] });
        const interventionRows: { breakdown: 'MODE' | 'NATURE'; category: string; quantity: number }[] = [
            ...Object.entries(after.intervention_types).map(([category, quantity]) => ({ breakdown: 'MODE' as const, category, quantity })),
            ...Object.entries(after.intervention_natures).map(([category, quantity]) => ({ breakdown: 'NATURE' as const, category, quantity })),
        ];
        for (const entry of interventionRows) {
            await tx.execute({
                sql: `INSERT INTO "mission_report_interventions" (id, report_id, breakdown, category, quantity)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), id, entry.breakdown, entry.category, entry.quantity],
            });
        }

        // Nom de l'éditeur figé à l'écriture, comme les valeurs des changements.
        const editorRes = await tx.execute({ sql: `SELECT name, email FROM "User" WHERE id = ?`, args: [editorId] });
        const editorName = editorRes.rows.length > 0
            ? ((editorRes.rows[0].name as string | null) || (editorRes.rows[0].email as string | null))
            : null;
        await tx.execute({
            sql: `INSERT INTO "mission_report_edits" (id, report_id, edited_by, edited_by_name, edited_at, changes) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, editorId, editorName, new Date().toISOString(), JSON.stringify(changes)],
        });

        await tx.commit();
        return { ok: true, changed: true, changes, before, after };
    } catch (e) {
        await tx.rollback();
        throw e;
    }
}
