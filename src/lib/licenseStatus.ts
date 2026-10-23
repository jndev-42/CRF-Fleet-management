/**
 * Décision « les papiers de ce conducteur sont-ils bloquants ? ».
 *
 * Extraite de `src/app/api/me/license-check/route.ts` pour être partagée avec la
 * garde serveur de `POST /api/trips`. La route conserve ses effets de bord (elle
 * matérialise l'invalidation en base) ; cette fonction est **pure** et ne décide
 * que de l'état, afin qu'une prise de véhicule ne déclenche jamais d'écriture.
 *
 * Aucune dispense par rôle : la décision vaut pour tout compte qui prend le volant,
 * gestionnaire compris (cf. `@/lib/licenseGuard`).
 */
import { canManageVehicles, isDriverRole } from '@/lib/roles';

/**
 * Compte qui peut prendre le volant : chauffeur, ou gestionnaire de flotte (dispensé du
 * rôle chauffeur, jamais des papiers). Sert à l'affichage — bandeau, colonne Papiers —
 * pour ne pas relancer des comptes qui n'empruntent jamais (trésorier, président…).
 * La garde serveur, elle, contrôle quiconque emprunte, sans condition de rôle.
 */
export function canBorrowVehicles(roles: string[]): boolean {
    return isDriverRole(roles) || canManageVehicles(roles);
}

/** Délai de grâce entre l'invalidation et le blocage effectif. */
export const INVALIDATION_GRACE_DAYS = 14;

/** Durée de validité d'une validation (2 fois par an, ~6 mois). */
export const VALIDATION_VALIDITY_DAYS = 182;

export interface LicenseRow {
    papiers_valides: number | null | undefined;
    last_validation: string | null | undefined;
    start_date_invalidation_process: string | null | undefined;
}

export interface LicenseStatus {
    validated: boolean;
    daysLeft: number | null;
    blocked: boolean;
    /** Date d'invalidation à persister, `null` si rien à écrire. Utilisé par la route. */
    startDateToPersist: string | null;
    /** `true` si la transition « valide → invalidé » vient d'être constatée. */
    justInvalidated: boolean;
}

/**
 * @param row    ligne `User` (papiers_valides, last_validation, start_date_invalidation_process)
 * @param today  date du jour au format `YYYY-MM-DD`
 */
export function getLicenseStatus(row: LicenseRow, today: string): LicenseStatus {
    let papiersValides = Number(row.papiers_valides ?? 1);
    const lastValidation = row.last_validation ?? null;
    let startDateInvalidation = row.start_date_invalidation_process ?? null;

    const validationExpired =
        lastValidation === null ||
        new Date(lastValidation).getTime() + VALIDATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000 <
            new Date(today).getTime();

    let startDateToPersist: string | null = null;
    let justInvalidated = false;

    if (validationExpired && papiersValides === 1) {
        // Transition : valide → invalidé. Le délai de grâce démarre aujourd'hui.
        papiersValides = 0;
        startDateInvalidation = today;
        startDateToPersist = today;
        justInvalidated = true;
    } else if (validationExpired && papiersValides === 0 && startDateInvalidation === null) {
        // Déjà invalide mais sans date de départ enregistrée.
        startDateInvalidation = today;
        startDateToPersist = today;
    }

    const validated = papiersValides === 1;
    if (validated) {
        return { validated: true, daysLeft: null, blocked: false, startDateToPersist, justInvalidated };
    }

    let daysLeft: number | null = null;
    let blocked = false;

    if (startDateInvalidation) {
        // Les dates `YYYY-MM-DD` sont lues en UTC : on ajoute les jours en UTC
        // pour qu'un changement d'heure local n'ajoute pas une heure (→ +1 jour arrondi).
        const blockDate = new Date(startDateInvalidation);
        blockDate.setUTCDate(blockDate.getUTCDate() + INVALIDATION_GRACE_DAYS);
        const msLeft = blockDate.getTime() - new Date(today).getTime();
        daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
        blocked = daysLeft === 0;
    }

    return { validated: false, daysLeft, blocked, startDateToPersist, justInvalidated };
}
