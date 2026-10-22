/**
 * Circuit de validation des notes de frais — règles pures, partagées par les
 * routes API et l'interface.
 *
 * Deux circuits coexistent, distingués par `workflowVersion` (écrit au scellement
 * #1, voir `CURRENT_WORKFLOW_VERSION` dans `sealing.ts`) :
 *   - v1 : `soumis` → le président valide en une étape (champ `Signature2`) ;
 *   - v2 : `soumis` → le RESPO signe (`Signature2`) → `valide_respo` → le
 *     président signe avec le tampon (`Signature4`).
 * Le paiement par le trésorier est identique dans les deux circuits.
 *
 * Aucun accès base ici : ces fonctions ne reçoivent que des valeurs déjà lues.
 */

import { isExpenseManager, canValidateExpenseAsRespo, isTresorier } from '@/lib/roles';

/** Étape de validation à laquelle se trouve une note. */
export type ValidationStage =
    /** Note v1 soumise : validation unique par le président. */
    | 'legacy'
    /** Note v2 soumise : étape « responsable d'activité ». */
    | 'respo'
    /** Note v2 validée par le RESPO : étape président. */
    | 'president';

/** UL par défaut d'une session sans UL active — même repli que les routes. */
const DEFAULT_UL_ID = 'ul-paris-18';

/** Normalise la colonne `workflowVersion` : toute valeur autre que 2 est l'ancien circuit. */
export function workflowVersionOf(raw: unknown): 1 | 2 {
    return Number(raw) === 2 ? 2 : 1;
}

/** Étape de validation en attente, ou `null` si la note n'attend aucune validation. */
export function validationStage(status: unknown, workflowVersion: unknown): ValidationStage | null {
    if (workflowVersionOf(workflowVersion) === 1) {
        return status === 'soumis' ? 'legacy' : null;
    }
    if (status === 'soumis') return 'respo';
    if (status === 'valide_respo') return 'president';
    return null;
}

/**
 * Peut signer (valider ou refuser) à cette étape.
 *
 * Le président et le super admin agissent à toutes les étapes ; le RESPO
 * seulement à la sienne. Une note v1 n'a pas d'étape RESPO : seul le président
 * la valide, comme avant.
 */
export function canSignStage(roles: string[], stage: ValidationStage): boolean {
    return stage === 'respo' ? canValidateExpenseAsRespo(roles) : isExpenseManager(roles);
}

/**
 * Le signataire valide les DEUX étapes d'un coup : c'est le président (ou le
 * super admin) qui signe à la place du RESPO. Deux révisions sont alors posées,
 * dans le champ RESPO puis dans le champ président.
 */
export function signsBothSteps(roles: string[], stage: ValidationStage): boolean {
    return stage === 'respo' && isExpenseManager(roles);
}

export interface ExpenseViewer {
    id: string;
    roles: string[];
    /** UL active de la session. */
    ulId?: string | null;
}

export interface ExpenseAccessRow {
    userId: unknown;
    status: unknown;
    ulId: unknown;
}

/** UL active d'une session (ou UL d'une note), avec le repli des routes. */
export function activeUlId(ulId: string | null | undefined): string {
    return ulId || DEFAULT_UL_ID;
}

/**
 * Peut consulter une note (détail et PDF scellé).
 *
 * - le demandeur ;
 * - le président / super admin ;
 * - le trésorier, pour une note en attente de paiement ;
 * - le RESPO, pour une note non brouillon de son UL active — il doit lire le
 *   document qu'il signe.
 */
export function canViewExpense(viewer: ExpenseViewer, row: ExpenseAccessRow): boolean {
    if (row.userId === viewer.id) return true;
    if (isExpenseManager(viewer.roles)) return true;
    if (isTresorier(viewer.roles) && row.status === 'en_attente_paiement') return true;
    return canValidateExpenseAsRespo(viewer.roles)
        && row.status !== 'brouillon'
        && activeUlId(typeof row.ulId === 'string' ? row.ulId : null) === activeUlId(viewer.ulId);
}
