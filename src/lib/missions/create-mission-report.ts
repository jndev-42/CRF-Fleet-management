import { z } from 'zod';
import { db } from '@/lib/db';
import { INTERVENTION_MODE_CATEGORIES, INTERVENTION_NATURE_CATEGORIES } from '@/lib/mission-interventions';

/**
 * Point d'écriture UNIQUE des comptes rendus de mission.
 *
 * Deux routes POST y mènent : `/api/missions` (formulaire `/missions/new`,
 * réservé aux rôles) et `/api/qr-ul/[token]/mission-report` (scan du QR code
 * d'une UL, ouvert à tout compte non INACTIF). Dupliquer la validation et la
 * transaction dans la seconde ferait diverger silencieusement les deux chemins à
 * la prochaine évolution du schéma — d'où l'extraction.
 *
 * Le contrôle d'accès reste À LA CHARGE DE CHAQUE ROUTE : ce module n'en fait
 * aucun, et ne doit jamais en faire (les deux routes ont des règles opposées,
 * volontairement).
 */

const supplySchema = z.object({
    category: z.enum(['SAC_PRIMAIRE', 'BRULURE', 'HEMORRHAGIE', 'KIT_DSA', 'HYGIENE', 'OXYGENE']),
    item_name: z.string().min(1),
    quantity_used: z.number().int().min(0),
});

/** Une case d'une grille de répartition. Chaque grille a sa propre énumération :
 *  une catégorie NATURE envoyée dans `intervention_types` serait stockée avec
 *  `breakdown='MODE'` puis ignorée à l'affichage (la fiche ne rend que les
 *  catégories de son propre groupe) — le total détaillé ne retomberait plus sur
 *  `victim_count` sans la moindre erreur. D'où deux schémas distincts. */
const interventionModeEntrySchema = z.object({
    category: z.enum(INTERVENTION_MODE_CATEGORIES as [string, ...string[]]),
    quantity: z.number().int().min(0),
});

const interventionNatureEntrySchema = z.object({
    category: z.enum(INTERVENTION_NATURE_CATEGORIES as [string, ...string[]]),
    quantity: z.number().int().min(0),
});

const sumQuantities = (entries: { quantity: number }[]) => entries.reduce((acc, e) => acc + e.quantity, 0);

const hasDuplicateCategory = (entries: { category: string }[]) =>
    new Set(entries.map(e => e.category)).size !== entries.length;

export const createMissionReportSchema = z.object({
    /** Rattachement du poste — exactement un des deux est renseigné (cf. superRefine). */
    selected_ul_id: z.string().min(1).nullable().optional(),
    selected_dt_code: z.string().min(1).nullable().optional(),
    mission_type: z.enum(['RESEAU', 'DPS', 'PAPS']),
    mission_name: z.string().min(1, 'Le nom de la mission est requis'),
    mission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format de date invalide (YYYY-MM-DD)' }),
    location: z.string().min(1, 'Le lieu est requis'),
    volunteers: z.string(),
    pegass_ok: z.boolean(),
    vehicle_id: z.string().nullable().optional(),
    driver_id: z.string().nullable().optional(),
    victim_count: z.number().int().min(0),
    presence_ul: z.boolean().nullable().optional(),
    team_dynamics: z.enum(['BIEN', 'PLUTOT_BIEN', 'PEUT_MIEUX', 'SUJET']).nullable().optional(),
    all_found_place: z.boolean().nullable().optional(),
    member_difficulties: z.boolean().nullable().optional(),
    free_comment: z.string().nullable().optional(),
    mission_comment: z.string().nullable().optional(),
    had_acr: z.boolean(),
    had_hemorrhage: z.boolean(),
    had_complex_care: z.boolean(),
    needs_followup: z.boolean(),
    supplies: z.array(supplySchema),
    /** Répartition du total par type de prise en charge — somme = victim_count. */
    intervention_types: z.array(interventionModeEntrySchema).default([]),
    /** Répartition du total par nature clinique — somme = victim_count. */
    intervention_natures: z.array(interventionNatureEntrySchema).default([]),
    drive_folder_id: z.string().nullable().optional(),
    signed_report_drive_id: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
    if (!data.pegass_ok && !data.volunteers.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['volunteers'],
            message: 'Requis si inscriptions Pegass non à jour',
        });
    }
    // Invariant du rattachement : exactement un des deux champs. Une UL ET une DT
    // rendraient la visibilité ambiguë ; aucune des deux rendrait le rapport
    // invisible dans « Tous les rapports » sans que personne l'ait choisi.
    const hasUl = Boolean(data.selected_ul_id);
    const hasDt = Boolean(data.selected_dt_code);
    if (hasUl === hasDt) {
        ctx.addIssue({
            code: 'custom',
            path: ['selected_ul_id'],
            message: hasUl
                ? 'Choisissez soit une UL, soit une Direction Territoriale — pas les deux.'
                : 'Veuillez sélectionner l\'UL ou la Direction Territoriale qui héberge le poste.',
        });
    }

    // Invariant de la répartition : le total « nombre d'intervention » est ventilé
    // deux fois — par type de prise en charge ET par nature clinique. Chaque grille
    // doit retomber exactement sur le total, sinon le détail contredirait le total
    // affiché partout ailleurs. À 0 intervention, aucune ligne n'a de sens.
    const modeSum = sumQuantities(data.intervention_types);
    const natureSum = sumQuantities(data.intervention_natures);

    // Une catégorie répétée passerait le contrôle de somme mais insérerait deux
    // lignes pour le même (report_id, breakdown, category) ; le regroupement du GET
    // n'en garde qu'une, et la répartition affichée ne totaliserait plus victim_count.
    if (hasDuplicateCategory(data.intervention_types)) {
        ctx.addIssue({
            code: 'custom',
            path: ['intervention_types'],
            message: 'Chaque catégorie de la répartition par type ne peut apparaître qu\'une fois.',
        });
    }
    if (hasDuplicateCategory(data.intervention_natures)) {
        ctx.addIssue({
            code: 'custom',
            path: ['intervention_natures'],
            message: 'Chaque catégorie de la répartition par nature ne peut apparaître qu\'une fois.',
        });
    }

    if (data.victim_count >= 1) {
        if (modeSum !== data.victim_count) {
            ctx.addIssue({
                code: 'custom',
                path: ['intervention_types'],
                message: `La répartition par type doit totaliser ${data.victim_count} intervention(s) — actuellement ${modeSum}.`,
            });
        }
        if (natureSum !== data.victim_count) {
            ctx.addIssue({
                code: 'custom',
                path: ['intervention_natures'],
                message: `La répartition par nature doit totaliser ${data.victim_count} intervention(s) — actuellement ${natureSum}.`,
            });
        }
    } else {
        if (modeSum > 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['intervention_types'],
                message: 'Aucune répartition par type n\'est possible sans intervention.',
            });
        }
        if (natureSum > 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['intervention_natures'],
                message: 'Aucune répartition par nature n\'est possible sans intervention.',
            });
        }
    }
});

export type CreateMissionReportInput = z.infer<typeof createMissionReportSchema>;

/** Résultat de l'insertion — l'appelant traduit `status`/`error` en réponse HTTP.
 *  Une exception reste une exception : elle remonte à la route, qui répond 500. */
export type InsertMissionReportResult =
    | { ok: true; id: string }
    | { ok: false; status: 400 | 401; error: string };

/**
 * Valide le rattachement, résout le soumetteur, puis insère le rapport, ses
 * consommables et sa répartition d'interventions dans une seule transaction.
 *
 * @param sessionUserId  `session.user.id` — peut être un email de repli en dev ;
 *                       sert uniquement à normaliser `driver_id` sur le vrai UUID.
 */
export async function insertMissionReport(
    data: CreateMissionReportInput,
    userEmail: string | null | undefined,
    sessionUserId?: string | null,
): Promise<InsertMissionReportResult> {
    // Le rattachement vient du client : vérifier qu'il désigne une vraie UL /
    // une DT réellement portée par une UL. Sans ce contrôle, un `ulId` inventé
    // rendrait le rapport invisible dans « Tous les rapports » sans erreur, et
    // un `dt_code` libre créerait une DT fantôme — or une DT n'existe QUE comme
    // valeur d'un `UniteLocale.dtCode`.
    if (data.selected_ul_id) {
        const ulRes = await db.execute({
            sql: `SELECT id FROM "UniteLocale" WHERE id = ?`,
            args: [data.selected_ul_id],
        });
        if (ulRes.rows.length === 0) {
            return { ok: false, status: 400, error: 'UL de rattachement introuvable.' };
        }
    } else if (data.selected_dt_code) {
        const dtRes = await db.execute({
            sql: `SELECT 1 FROM "UniteLocale" WHERE dtCode = ?`,
            args: [data.selected_dt_code],
        });
        if (dtRes.rows.length === 0) {
            return { ok: false, status: 400, error: 'Direction Territoriale de rattachement introuvable.' };
        }
    }

    // Resolve the actual DB User.id from email — session.user.id may be an email fallback in dev
    if (!userEmail) {
        return { ok: false, status: 401, error: 'Session invalide — veuillez vous reconnecter.' };
    }
    const userRes = await db.execute({
        sql: `SELECT id FROM "User" WHERE email = ?`,
        args: [userEmail],
    });
    if (userRes.rows.length === 0) {
        return { ok: false, status: 401, error: 'Utilisateur introuvable — veuillez vous reconnecter.' };
    }
    const submittedBy = userRes.rows[0].id as string;

    // Normalize driver_id: frontend may pass session.user.id which is email in dev — map to real UUID
    const rawDriverId = data.driver_id ?? null;
    const driverId = rawDriverId !== null && rawDriverId === sessionUserId ? submittedBy : rawDriverId;

    const reportId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const ulId = data.selected_ul_id ?? null;
    const dtCode = ulId ? null : (data.selected_dt_code ?? null);
    const tx = await db.transaction('write');
    try {
        await tx.execute({
            sql: `INSERT INTO "mission_reports" (
                id, submitted_by, submitted_at, mission_type, mission_name, mission_date,
                location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count,
                presence_ul, team_dynamics, all_found_place, member_difficulties, free_comment,
                mission_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup,
                drive_folder_id, signed_report_drive_id, ulId, dt_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                reportId,
                submittedBy ?? null,
                submittedAt,
                data.mission_type,
                data.mission_name,
                data.mission_date,
                data.location,
                data.volunteers,
                data.pegass_ok ? 1 : 0,
                data.vehicle_id ?? null,
                driverId,
                data.victim_count,
                data.presence_ul !== undefined && data.presence_ul !== null ? (data.presence_ul ? 1 : 0) : null,
                data.team_dynamics ?? null,
                data.all_found_place !== undefined && data.all_found_place !== null ? (data.all_found_place ? 1 : 0) : null,
                data.member_difficulties !== undefined && data.member_difficulties !== null ? (data.member_difficulties ? 1 : 0) : null,
                data.free_comment ?? null,
                data.mission_comment ?? null,
                data.had_acr ? 1 : 0,
                data.had_hemorrhage ? 1 : 0,
                data.had_complex_care ? 1 : 0,
                data.needs_followup ? 1 : 0,
                data.drive_folder_id ?? null,
                data.signed_report_drive_id ?? null,
                ulId,
                dtCode,
            ],
        });

        // Insert only supplies with quantity_used > 0
        for (const supply of data.supplies) {
            if (supply.quantity_used > 0) {
                await tx.execute({
                    sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), reportId, supply.category, supply.item_name, supply.quantity_used],
                });
            }
        }

        // Répartition des interventions — stockage sparse (seules les cases
        // renseignées sont écrites) ; le `breakdown` vient du champ d'origine.
        const interventionRows: { breakdown: 'MODE' | 'NATURE'; category: string; quantity: number }[] = [
            ...data.intervention_types.map(e => ({ breakdown: 'MODE' as const, category: e.category, quantity: e.quantity })),
            ...data.intervention_natures.map(e => ({ breakdown: 'NATURE' as const, category: e.category, quantity: e.quantity })),
        ];
        for (const entry of interventionRows) {
            if (entry.quantity > 0) {
                await tx.execute({
                    sql: `INSERT INTO "mission_report_interventions" (id, report_id, breakdown, category, quantity)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), reportId, entry.breakdown, entry.category, entry.quantity],
                });
            }
        }

        await tx.commit();
        return { ok: true, id: reportId };
    } catch (e) {
        await tx.rollback();
        throw e;
    }
}
