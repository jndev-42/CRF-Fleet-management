import type { MissionFormData } from '@/components/missions/MissionWizard';

/** Sous-ensemble du détail renvoyé par GET /api/missions/[id] utile au pré-remplissage. */
export interface MissionReportForEdit {
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string | null;
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
    volunteer_accident?: boolean;
    volunteer_accident_details?: string | null;
    supplies: Record<string, { item_name: string; quantity_used: number }[]>;
    interventions?: { mode: Record<string, number>; nature: Record<string, number> };
}

/**
 * Convertit un rapport enregistré en état initial du wizard en mode édition :
 * champs du formulaire et carte plate des consommables (`${catégorie}__${article}`).
 * Le rattachement est conservé tel quel côté serveur — il n'est pas repris ici.
 */
export function reportToWizardState(report: MissionReportForEdit): {
    formData: MissionFormData;
    supplies: Record<string, number>;
} {
    const supplies: Record<string, number> = {};
    for (const [category, items] of Object.entries(report.supplies ?? {})) {
        for (const item of items) {
            if (item.quantity_used > 0) {
                const key = `${category}__${item.item_name}`;
                // Lignes en double (même article) : cumulées, comme la comparaison côté serveur.
                supplies[key] = (supplies[key] ?? 0) + item.quantity_used;
            }
        }
    }

    const formData: MissionFormData = {
        selected_ul_id: null,
        selected_dt_code: null,
        mission_type: report.mission_type as MissionFormData['mission_type'],
        mission_name: report.mission_name,
        mission_date: report.mission_date,
        location: report.location,
        volunteers: report.volunteers ?? '',
        pegass_ok: report.pegass_ok,
        vehicle_id: report.vehicle_id,
        driver_id: report.driver_id,
        victim_count: report.victim_count,
        presence_ul: report.presence_ul,
        team_dynamics: report.team_dynamics as MissionFormData['team_dynamics'],
        all_found_place: report.all_found_place,
        member_difficulties: report.member_difficulties,
        free_comment: report.free_comment,
        mission_comment: report.mission_comment,
        had_acr: report.had_acr,
        had_hemorrhage: report.had_hemorrhage,
        had_complex_care: report.had_complex_care,
        needs_followup: report.needs_followup,
        volunteer_accident: Boolean(report.volunteer_accident),
        volunteer_accident_details: report.volunteer_accident_details ?? '',
        intervention_types: { ...(report.interventions?.mode ?? {}) },
        intervention_natures: { ...(report.interventions?.nature ?? {}) },
    };

    return { formData, supplies };
}
